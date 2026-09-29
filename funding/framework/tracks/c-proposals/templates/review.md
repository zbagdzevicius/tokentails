# Reviews — {{PROGRAM}}

Hostile-review rounds are appended here by `fund c:review {{SLUG}}` (or
`fund prompt review {{SLUG}} --run`). Keep every round: `fund c:score {{SLUG}}` scores the latest
one and shows the trend across all of them.

Each round starts with a `## Review — <date or label>` heading and contains a score table whose
first column is the criterion ID:

    | ID | Score | Reason |
    |---|---|---|
    | C1 | 7/10 | one-line reason |

Scores may be written as 7/10, 3.5/5, 70% or a bare number (read on `score_scale`).
Record the real panel's feedback as its own round after a decision.
