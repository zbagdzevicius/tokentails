import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { IEncryptedMessage } from 'src/user/user.schema';

@Injectable()
export class EncryptionService {
    static algorithm = 'aes-128-ctr';
    static key = scryptSync(process.env.INVALIDATE_CACHE_SECRET!, 'salt', 16);

    encrypt(text: string): IEncryptedMessage {
        const iv = randomBytes(16);
        const cipher = createCipheriv(EncryptionService.algorithm, EncryptionService.key, iv);
        const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);

        return {
            iv: iv.toString('hex'),
            content: encrypted.toString('hex'),
        };
    }

    decrypt(data: IEncryptedMessage): string {
        const iv = Buffer.from(data.iv, 'hex');
        const decipher = createDecipheriv(EncryptionService.algorithm, EncryptionService.key, iv);
        const decrypted = Buffer.concat([decipher.update(Buffer.from(data.content, 'hex')), decipher.final()]);

        return decrypted.toString();
    }
}
