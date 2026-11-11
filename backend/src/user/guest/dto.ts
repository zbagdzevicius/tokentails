import { ValidationPipe } from '@nestjs/common';
import { IsMongoId, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Body of `POST /user/catbassadors/referral` (decision #12). */
export class ReferralDto {
    @IsMongoId()
    referrerId: string;
}

/** Body of `DELETE /user/me` (G9). The code comes from a fresh native Sign in with Apple prompt. */
export class DeleteAccountDto {
    @IsOptional()
    @IsString()
    @MaxLength(2048)
    appleAuthorizationCode?: string;

    /**
     * The app the code came from (`com.tokentails.app`, `com.tokentails.pawlegends`). Only an id on
     * APPLE_CLIENT_IDS is used (apple-revoke.ts); anything else falls back to APPLE_CLIENT_ID.
     */
    @IsOptional()
    @IsString()
    @Matches(/^[A-Za-z0-9.-]{1,155}$/)
    appleClientId?: string;
}

/** Strict pipe for the identity routes: unknown fields are rejected. */
export const guestBodyPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
});
