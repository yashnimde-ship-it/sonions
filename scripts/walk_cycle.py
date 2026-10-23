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
    swing = max(1, round(height * 0.03))  # how far an arm swings

    def pose(step_left, dip):
        out = np.zeros_like(a)
        # Planted leg first, then the body and arms, then the stepping leg (it reads as "in front").
        planted, stepping = (right_leg, left_leg) if step_left else (left_leg, right_leg)
        _paste(out, a, 0, 0, planted)
        # From behind, the arm on the stepping side swings back (down); from the front, forward (up).
        fwd_arm, back_arm = (right_arm, left_arm) if step_left else (left_arm, right_arm)
        _paste(out, a, 0, dip, body)
        _paste(out, a, 0, dip - swing if not back else dip + swing, fwd_arm)
        _paste(out, a, 0, dip + swing if not back else dip - swing, back_arm)
        _paste(out, a, 0, -lift, stepping, shade=1.0)
        # Close any gap between the body and a lifted leg by repeating the hip row.
        return out

    passing = np.zeros_like(a)
    _paste(passing, a, 0, -1, opaque)  # legs together, body at its highest
    passing[bottom] = a[bottom]         # feet stay on the ground
    return [_img(pose(True, 1)), _img(passing), _img(pose(False, 1)), _img(passing)]


def _side(view):
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

    def pose(amount, dip):
        out = np.zeros_like(a)
        legs_moved(out, amount)
        _paste(out, a, 0, dip, body)
        return out

    step = pose(max(1, round(half * 0.15)), 1)
    passing = pose(-round(half * 0.7), -1)
    return [_img(step), _img(passing), _img(step), _img(passing)]


def walk_frames(view, kind):
    """Four walk frames for a view: kind is 'front', 'back' or 'side' (facing left)."""
    if kind == 'side':
        return _side(view)
    return _front_back(view, back=(kind == 'back'))
