/*
 * Hidden Glicko-2 (docs/plans/moba/M1A-IMPL.md §4.1), after Glickman, "Example of the Glicko-2 system" (2013): τ 0.5,
 * defaults r 1500 / RD 350 / σ 0.06, an RD floor of 45, the Illinois algorithm for σ' (ε 1e-6). Pure and
 * deterministic: the same inputs give the same floats. Matchmaking data only, never a score and never shown.
 */

export interface Glicko {
    r: number;
    rd: number;
    sigma: number;
}

export interface GlickoResult {
    r: number;
    rd: number;
    /** 1 won, 0 lost (0.5 a draw; co-op has none). */
    score: number;
}

export const GLICKO = Object.freeze({
    tau: 0.5,
    r: 1500,
    rd: 350,
    sigma: 0.06,
    rdFloor: 45,
    rdMax: 350,
    epsilon: 1e-6,
    /** One rating period of RD growth per full this many ms idle. */
    periodMs: 7 * 86_400_000,
});

const SCALE = 173.7178;

export const DEFAULT_GLICKO: Readonly<Glicko> = Object.freeze({ r: GLICKO.r, rd: GLICKO.rd, sigma: GLICKO.sigma });

/**
 * The co-op opponent (§4.1): the enemy team is always bots, so each human is rated against one fixed pseudo-player per
 * room difficulty, at full weight.
 */
export const BOT_RATING: Readonly<Record<string, { r: number; rd: number }>> = Object.freeze({
    rookie: Object.freeze({ r: 1000, rd: 60 }),
    easy: Object.freeze({ r: 1250, rd: 60 }),
    normal: Object.freeze({ r: 1500, rd: 60 }),
    hard: Object.freeze({ r: 1750, rd: 60 }),
});

/**
 * The seed for an account without a row, from its client-reported top unlocked difficulty (`hello.hint`, untrusted,
 * matching only). No hint: the Glicko-2 default.
 */
export function seedRating(maxDifficulty: string | null | undefined): Glicko {
    const r = { rookie: 1150, easy: 1350, normal: 1550, hard: 1750 }[maxDifficulty ?? ''];
    return r === undefined ? { ...DEFAULT_GLICKO } : { r, rd: 300, sigma: GLICKO.sigma };
}

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu: number, muj: number, phij: number) => 1 / (1 + Math.exp(-g(phij) * (mu - muj)));

/** One rating period with these results (an empty list only grows RD). */
export function glicko2Update(player: Glicko, results: readonly GlickoResult[], tau = GLICKO.tau): Glicko {
    const mu = (player.r - 1500) / SCALE;
    const phi = player.rd / SCALE;
    const sigma = player.sigma;
    if (!results.length) {
        const phiStar = Math.sqrt(phi * phi + sigma * sigma);
        return clampRd({ r: player.r, rd: phiStar * SCALE, sigma });
    }
    let vInv = 0;
    let deltaSum = 0;
    for (const o of results) {
        const muj = (o.r - 1500) / SCALE;
        const phij = o.rd / SCALE;
        const e = E(mu, muj, phij);
        const gj = g(phij);
        vInv += gj * gj * e * (1 - e);
        deltaSum += gj * (o.score - e);
    }
    const v = 1 / vInv;
    const delta = v * deltaSum;
    // σ' by the Illinois algorithm
    const a = Math.log(sigma * sigma);
    const f = (x: number) => {
        const ex = Math.exp(x);
        const d = phi * phi + v + ex;
        return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d * d) - (x - a) / (tau * tau);
    };
    let A = a;
    let B: number;
    if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
    else {
        let k = 1;
        while (f(a - k * tau) < 0) k++;
        B = a - k * tau;
    }
    let fA = f(A);
    let fB = f(B);
    for (let i = 0; i < 100 && Math.abs(B - A) > GLICKO.epsilon; i++) {
        const C = A + ((A - B) * fA) / (fB - fA);
        const fC = f(C);
        if (fC * fB <= 0) {
            A = B;
            fA = fB;
        } else fA /= 2;
        B = C;
        fB = fC;
    }
    const sigmaNew = Math.exp(A / 2);
    const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
    const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
    const muNew = mu + phiNew * phiNew * deltaSum;
    return clampRd({ r: muNew * SCALE + 1500, rd: phiNew * SCALE, sigma: sigmaNew });
}

function clampRd(x: Glicko): Glicko {
    return { r: x.r, rd: Math.min(GLICKO.rdMax, Math.max(GLICKO.rdFloor, x.rd)), sigma: x.sigma };
}

/** Inactivity: one rating period of RD growth per full 7 days since `lastAtMs`, capped at 350. */
export function growRd(x: Glicko, lastAtMs: number | null, nowMs: number): Glicko {
    if (lastAtMs === null || !(nowMs > lastAtMs)) return { ...x };
    const periods = Math.floor((nowMs - lastAtMs) / GLICKO.periodMs);
    let out = { ...x };
    for (let i = 0; i < periods && out.rd < GLICKO.rdMax; i++) out = glicko2Update(out, []);
    return out;
}

/** A co-op result: the player against the bot pseudo-player of the room difficulty. */
export function coopUpdate(x: Glicko, difficulty: string, won: boolean): Glicko {
    const bot = BOT_RATING[difficulty] ?? BOT_RATING.normal;
    return glicko2Update(x, [{ r: bot.r, rd: bot.rd, score: won ? 1 : 0 }]);
}
