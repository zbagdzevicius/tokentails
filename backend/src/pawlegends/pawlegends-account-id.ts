/*
 * The account id key of a Pawlegends checkout (POC.md §8.3, §8.5). `POST /pawlegends/checkout/account` runs behind
 * AppAuthGuard (registered accounts only: guests are not allowed to buy, decision #9), and its user id joins the
 * email and the device id as a spend-cap and once-only key. `POST /pawlegends/checkout` takes no accesstoken: the
 * host calls it without a session, or when the account route refuses one.
 */

/** The user id of an authenticated request, else null (no user, or a transient guest with no document). */
export function accountIdOf(req: any): string | null {
    const id = req?.user?._id ?? req?.user?.id;
    return id && !req?.user?.transient ? String(id) : null;
}
