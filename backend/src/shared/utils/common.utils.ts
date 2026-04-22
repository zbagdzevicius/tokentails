import { headers } from '../constants/articles.constants';

import fetch from 'node-fetch';

export async function sleep(ms = 1000) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getPageHtml(url: string) {
    return fetch(url, { headers }).then(response => response.text());
}
