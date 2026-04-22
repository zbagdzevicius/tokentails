export async function handler(request: Promise<Response>, throwError = false) {
    try {
        const response = await request;
        if (response.ok) {
            return response.json();
        }
        throw response;
    } catch (e) {
        console.error('API ERROR', e);
        if (throwError) {
            throw new Error('NFT Generation error');
        }
    }
}
