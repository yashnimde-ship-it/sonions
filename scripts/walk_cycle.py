"""A walk cycle made from a single standing pose, for the character sheets.

The concept sheets only have one pose per view, so the walking frames are built by cutting
each (already shrunk) pixel sprite into body, arms and legs, and moving those parts:

  front / back views: the stepping leg lifts, the opposite arm swings forward (up), the
                      other arm back (down); the body dips on each step
  side view:          the legs scissor (near leg forward, far leg back and shaded), the arm
                      swings against the near leg; the body dips on each step

walk_frames(view, kind) returns four frames: step one, passing, step two, passing.
Everything works on whole pixels, so the art stays crisp.
"""
import numpy as np
from PIL import Image


def _rgba(img):
    return np.array(img.convert('RGBA'))


def _img(a):
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def _paste(dst, src_rgba, dx, dy, mask=None, shade=1.0):
    """Draws the opaque pixels of src (optionally only where mask) onto dst, shifted by dx, dy."""
    h, w = src_rgba.shape[:2]
    ys, xs = np.nonzero((src_rgba[:, :, 3] > 0) & (mask if mask is not None else True))
    ty, tx = ys + dy, xs + dx
    ok = (ty >= 0) & (ty < dst.shape[0]) & (tx >= 0) & (tx < dst.shape[1])
    px = src_rgba[ys[ok], xs[ok]].astype(np.float32)
    if shade != 1.0:
        px[:, :3] *= shade
    dst[ty[ok], tx[ok]] = px.astype(np.uint8)


def _anatomy(a):
    """Rows and columns of the parts: (top, bottom, hip row, crotch x, hip left, hip right)."""
    alpha = a[:, :, 3] > 0
    rows = np.nonzero(alpha.any(axis=1))[0]
    cols = np.nonzero(alpha.any(axis=0))[0]
    top, bottom = rows[0], rows[-1]
    left, right = cols[0], cols[-1]
    height = bottom - top + 1
    # The crotch: the highest row where a gap opens between the legs, found by walking up
    # the middle columns from the feet while the gap stays open.
    mid = (left + right) // 2
    best = None
    for cx in range(mid - 4, mid + 5):
        y = bottom
        while y > top and not alpha[y, cx]:
            y -= 1
        # A real leg gap runs from the feet up at least 15% of the height.
        if bottom - y >= height * 0.15 and (best is None or y < best[0]):
            best = (y, cx)
    if best is None:
        hip, crotch_x = top + int(height * 0.6), mid
    else:
        hip, crotch_x = best
    # Hip width: the legs' outer edges just below the crotch.
    span = np.nonzero(alpha[min(bottom, hip + 3)])[0]
    hip_l, hip_r = (span[0], span[-1]) if len(span) else (left, right)
    return top, bottom, hip, crotch_x, hip_l, hip_r


def narrow_stance(view):
    """
    Front/back views: the concepts stand in a wide A-pose. This angles each leg in from the
    hip so the feet end up close together, like a normal stance: no shift at the hip, the
    most at the feet. Used for the standing frames and as the base of the walk.
    """
    a = _rgba(view)
    h, w = a.shape[:2]
    top, bottom, hip, cx, _, _ = _anatomy(a)
    opaque = a[:, :, 3] > 0
    # The gap between the feet, a few rows above the soles.
    row = opaque[max(hip, bottom - 4)]
    left_feet = np.nonzero(row[:cx])[0]
    right_feet = np.nonzero(row[cx:])[0]
    if not len(left_feet) or not len(right_feet):
        return view
    gap = (right_feet[0] + cx) - left_feet[-1] - 1
    pull = max(0, (gap - 2) // 2)  # leave about 2 px between the feet
    if pull == 0:
        return view
    out = a.copy()
    out[hip:] = 0
    top_leg = hip - 1
    # The legs angle in down to the ankle; the shoes move as solid pieces below it, so they
    # keep their shape (toes still pointing outward) instead of being slanted inward.
    ankle = bottom - max(4, round((bottom - top) * 0.13))
    for y in range(top_leg, bottom + 1):
        t = min(1.0, (y - top_leg) / max(1, ankle - top_leg))
        d = round(pull * t)
        for x in np.nonzero(opaque[y])[0]:
            nx = x + d if x < cx else x - d
            if 0 <= nx < w:
                out[y, nx] = a[y, x]
    return _img(out)


def _front_back(view, back=False):
    a = _rgba(view)
    h, w = a.shape[:2]
    top, bottom, hip, cx, hip_l, hip_r = _anatomy(a)
    height = bottom - top + 1
    yy, xx = np.mgrid[0:h, 0:w]
    opaque = a[:, :, 3] > 0
    leg_top = hip - 1
    legs = opaque & (yy >= leg_top)
    left_leg = legs & (xx < cx)
    right_leg = legs & (xx >= cx)
    # Arms: beside the hips, from the shoulders down to just past the hip line.
    shoulder = top + int(height * 0.28)
    arm_rows = (yy >= shoulder) & (yy < hip + 4)
    left_arm = opaque & arm_rows & (xx < hip_l) & ~legs
    right_arm = opaque & arm_rows & (xx > hip_r) & ~legs
    body = opaque & ~legs & ~left_arm & ~right_arm

    lift = max(3, round(height * 0.065))  # how high the stepping foot comes up
    swing = max(3, round(height * 0.06))  # how far the forward arm comes up

    def arm(dst, mask, side, forward, dip):
        """
        One arm, swung: forward lifts it (hand tucked in toward the body, as if coming at
        the camera); back drops it and lets the hand swing out. `side` is -1 for the arm
        on the left of the image, +1 for the right.
        """
        rows = np.nonzero(mask.any(axis=1))[0]
        if not len(rows):
            return
        r0, r1 = rows[0], rows[-1]
        for y in range(r0, r1 + 1):
            t = (y - r0) / max(1, r1 - r0)  # 0 at the shoulder, 1 at the hand
            if forward:
                dy, dx = -swing + dip, -side * round(2 * t)
            else:
                dy, dx = round(swing * 0.6) + dip, side * round(1.5 * t)
            for x in np.nonzero(mask[y])[0]:
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w:
                    dst[ny, nx] = a[y, x]

    def pose(step_left, dip):
        out = np.zeros_like(a)
        # Planted leg first, then the body and arms, then the stepping leg (it reads as "in front").
        planted, stepping = (right_leg, left_leg) if step_left else (left_leg, right_leg)
        _paste(out, a, 0, 0, planted)
        _paste(out, a, 0, dip, body)
        # The arm opposite the stepping leg swings forward. Seen from behind, "forward" is
        # away from the camera, so it drops instead of lifting.
        left_fwd = not step_left
        if back:
            left_fwd = not left_fwd
        arm(out, left_arm, -1, left_fwd, dip)
        arm(out, right_arm, +1, not left_fwd, dip)
        _paste(out, a, 0, -lift, stepping)
        return out

    passing = np.zeros_like(a)
    _paste(passing, a, 0, -1, opaque)  # legs together, body at its highest
    passing[bottom] = a[bottom]         # feet stay on the ground
    return [_img(pose(True, 1)), _img(passing), _img(pose(False, 1)), _img(passing)]


def _swing_forearm(out, a, box, amount, body_cx):
    """
    Swings the forearm in `box` (x0, y0, x1, y1, end exclusive; y0 is the elbow) as a rigid
    piece rotating about the elbow, so the hand moves `amount` px sideways (negative is
    forward when facing left). Where the arm was, a block of torso texture from beside it
    is copied in, so nothing smears.
    """
    x0, y0, x1, y1 = box
    h, w = a.shape[:2]
    src = out.copy()
    region = np.zeros((h, w), bool)
    region[y0:y1, x0:x1] = src[y0:y1, x0:x1, 3] > 0
    if not region.any():
        return
    # Pivot: the middle of the arm's top row (the elbow).
    top_cols = np.nonzero(region[y0])[0]
    px = (top_cols[0] + top_cols[-1]) / 2 if len(top_cols) else (x0 + x1) / 2
    py = y0
    length = max(1, y1 - 1 - y0)
    theta = -np.arcsin(max(-0.9, min(0.9, amount / length)))
    c, s_ = np.cos(theta), np.sin(theta)

    # 1. Fill the arm's spot with torso texture: the same shape, copied from one arm-width
    #    toward the body (falling back to the other side).
    bw = x1 - x0
    toward = 1 if body_cx >= (x0 + x1) / 2 else -1
    for y, x in zip(*np.nonzero(region)):
        for k in (toward, -toward, 2 * toward):
            fx = x + k * bw
            if 0 <= fx < w and src[y, fx, 3] > 0 and not region[y, fx]:
                out[y, x] = src[y, fx]
                break
        else:
            out[y, x] = 0

    # 2. Draw the arm rotated about the elbow (inverse mapping, nearest pixel: crisp edges).
    pad = abs(amount) + 2
    for ty in range(max(0, y0 - 2), min(h, y1 + 2)):
        for tx in range(max(0, x0 - pad), min(w, x1 + pad)):
            rx, ry = tx - px, ty - py
            sx = round(px + rx * c + ry * s_)
            sy = round(py - rx * s_ + ry * c)
            if 0 <= sx < w and 0 <= sy < h and region[sy, sx]:
                out[ty, tx] = src[sy, sx]


def _side(view, forearm=None):
    """
    Side view facing left. The profile art already stands mid-stride, so the walk opens and
    closes that stride: legs a little wider on the steps, drawn together on the passing
    frames (with the body at its highest). The legs are moved, not stretched, so no foot is
    ever doubled or squeezed.
    """
    a = _rgba(view)
    h, w = a.shape[:2]
    top, bottom, _, _, _, _ = _anatomy(a)
    height = bottom - top + 1
    hip = top + int(height * 0.56)
    yy, xx = np.mgrid[0:h, 0:w]
    opaque = a[:, :, 3] > 0
    legs = opaque & (yy >= hip)
    body = opaque & ~legs
    xs = np.nonzero(legs.any(axis=0))[0]
    cx = (xs[0] + xs[-1]) / 2 if len(xs) else w / 2

    feet = np.nonzero(legs[bottom - 2:bottom + 1].any(axis=0))[0]
    half = (feet[-1] - feet[0]) / 2 if len(feet) else 4

    def legs_moved(dst, amount):
        """
        Each leg moved as a whole, more at the feet than at the hip: `amount` < 0 draws them
        together, > 0 apart. The far (rear) leg goes first and a little darker, so where the
        legs cross the near leg stays in front; shoes keep their shape.
        """
        for near in (False, True):
            for y in range(hip, bottom + 1):
                t = (y - hip) / max(1, bottom - hip)
                d = round(amount * t)
                for x in np.nonzero(legs[y])[0]:
                    front = x < cx  # facing left, the near leg is the forward one
                    if front != near:
                        continue
                    nx = x - d if front else x + d
                    if 0 <= nx < w:
                        px = a[y, x].astype(np.float32)
                        if not near:
                            px[:3] *= 0.8
                        dst[y, nx] = px.astype(np.uint8)

    def pose(amount, dip, arm=0):
        out = np.zeros_like(a)
        legs_moved(out, amount)
        _paste(out, a, 0, dip, body)
        if forearm and arm:
            x0, y0, x1, y1 = forearm
            _swing_forearm(out, out.copy(), (x0, y0 + dip, x1, y1 + dip), arm, cx)
        return out

    reach = max(3, round(height * 0.06))
    stride = max(1, round(half * 0.15))
    # On the two steps the hand swings forward, then back, against the legs.
    step_a = pose(stride, 1, -reach)
    step_b = pose(stride, 1, reach)
    passing = pose(-round(half * 0.7), -1)
    return [_img(step_a), _img(passing), _img(step_b), _img(passing)]


def _drop_specks(img, max_size=4):
    """Removes tiny detached bits (a few pixels cut loose when parts move) from a frame."""
    a = _rgba(img)
    alpha = a[:, :, 3] > 0
    h, w = alpha.shape
    seen = np.zeros_like(alpha)
    for sy, sx in zip(*np.nonzero(alpha)):
        if seen[sy, sx]:
            continue
        comp = [(sy, sx)]
        seen[sy, sx] = True
        for y, x in comp:
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and alpha[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        comp.append((ny, nx))
        if len(comp) <= max_size:
            for y, x in comp:
                a[y, x] = 0
    return _img(a)


def walk_frames(view, kind, forearm=None):
    """
    Four walk frames for a view: kind is 'front', 'back' or 'side' (facing left). For the
    side view, `forearm` is the near forearm's box in the frame (x0, y0, x1, y1; y0 at the
    elbow): it can't be told apart from the torso automatically, so it's marked per character.
    """
    if kind == 'side':
        frames = _side(view, forearm)
    else:
        frames = _front_back(narrow_stance(view), back=(kind == 'back'))
    return [_drop_specks(f) for f in frames]
