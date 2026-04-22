import * as dotenv from 'dotenv';
dotenv.config();
import { generateAvatarFromImage } from './utils/ai-avatar';
import { CatAbilityType } from '../cat/cat.schema';

export async function testGenerateAvatar() {
    try {
        console.log('Testing generateAvatarFromImage function...\n');

        // Example image URL - replace with a real image URL you want to test with
        const imageUrl = 'https://tokentails.fra1.cdn.digitaloceanspaces.com/57679628825.png';

        console.log('Input parameters:');
        console.log(`  Image URL: ${imageUrl}`);

        console.log('Calling generateAvatarFromImage...');
        const result = await generateAvatarFromImage(imageUrl, CatAbilityType.SAND);

        console.log('\n✅ Success! Generated avatar URL:');
        console.log(result);
        console.log('\nYou can open this URL in your browser to see the generated image.');

        return result;
    } catch (error) {
        console.error('\n❌ Error testing generateAvatarFromImage:');
        console.error(error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
        }
        process.exit(1);
    }
}
