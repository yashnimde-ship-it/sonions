// Development-only leaderboard population. These are fictional handles for UI playtesting;
// they never enter the profile store and therefore never affect real players' places or REP.

import { DIVISIONS, RANKS, REP_PER_DIVISION, type BoardRow } from '../src/data/ranks.ts';

const NAMES = [
  'VelvetVesper', 'CipherKestrel', 'MangoMisdirect', 'NovaLocke', 'RookAndRiddle', 'SableSwitch', 'MintCondition', 'OrbitOcelot', 'CrimsonCaper', 'JunoJinx',
  'StaticSparrow', 'BrassBanshee', 'MiraMoth', 'EchoEmber', 'RavenReroute', 'LuckyLantern', 'VantaVixen', 'GildedGadget', 'MoonlitMink', 'JadeJaunt',
  'PixelProwler', 'CobaltCoyote', 'SaffronSignal', 'TempoThief', 'NeonNightingale', 'QuartzQuill', 'MischiefMason', 'IvyIcarus', 'OnyxOrbit', 'SlySundial',
  'ArcticAlias', 'PoppyPiston', 'KiteKarma', 'BasiliskByte', 'DapperDart', 'FableFlicker', 'RiftRaccoon', 'TangoTalisman', 'KoiKnavery', 'AmberAxiom',
  'SonicSatchel', 'LilacLarceny', 'CometCrow', 'NimbleNora', 'DuskDynamo', 'MapleMirage', 'VoltVellum', 'CinderCloak', 'BiscuitBandit', 'RuneRunner',
  'KarmaKite', 'GlitchGarnet', 'MarbleMarauder', 'WhisperWarden', 'FrostFable', 'TinselTactician', 'IndigoInk', 'PocketPanda', 'SierraSleight', 'CopperComet',
  'NoxNightingale', 'WrenWildcard', 'CosmoCricket', 'RubyRuse', 'JasperJaunt', 'TaffyTalon', 'OmenOsprey', 'ZestZephyr', 'HushHarbor', 'LumenLynx',
  'MosaicMongoose', 'AsterAfterimage', 'HollowHare', 'PiperPincer', 'SatinSundown', 'TricksterTide', 'FennelFox', 'BrambleByte', 'DoodleDagger', 'VioletVault',
  'KestrelKey', 'PrismPicket', 'CloverCipher', 'SableSonnet', 'BerylBlink', 'FoxfireFable', 'TangoTarnish', 'QuasarQuirk', 'NimbusNudge', 'RogueRaspberry',
  'SphinxSpark', 'WillowWire', 'CobaltCrescent', 'MorrowMantis', 'FlickerFennec', 'ParchmentPuma', 'GarnetGambit', 'JuniperJolt', 'MoxieMoth', 'WispWavelength',
] as const;

const safecracker = RANKS.findIndex((rank) => rank.id === 'safecracker');
/** Safecracker III's final REP point; no mock player can exceed it. */
const MAX_REP = (safecracker + 1) * DIVISIONS * REP_PER_DIVISION - 1;

/** 100 believable, rank-varied rows, highest to lowest, for local UI testing. */
export function demoLeaderboardRows(): BoardRow[] {
  return NAMES.map((name, i) => {
    const rep = Math.round(MAX_REP * (1 - i / (NAMES.length - 1)));
    const matches = 12 + ((i * 17) % 76);
    const wins = Math.max(0, Math.min(matches, Math.round(matches * (0.18 + ((i * 11) % 42) / 100))));
    return { place: i + 1, name, rep, wins, matches };
  });
}
