// SudGPT — Cloudflare Worker Proxy
// Securely proxies chat requests to OpenAI without exposing the API key.
//
// Environment variables (set in Cloudflare dashboard as secrets):
//   OPENAI_API_KEY  — your OpenAI project API key
//
// Deploy: paste this into a Cloudflare Worker, add the secret, done.

const MODEL_ID = 'ft:gpt-4.1-nano-2025-04-14:personal:sudgpt:DAo8jl7J'; // Replace with your fine-tuned model ID
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

export default {
    async fetch(request, env) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: CORS_HEADERS
            });
        }

        const jsonHeaders = {
            ...CORS_HEADERS,
            'Content-Type': 'application/json'
        };

        // Only accept POST
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: jsonHeaders,
            });
        }

        try {
            const body = await request.json();

            // Forward only the messages array — ignore any model/key overrides from the client
            const messages = body.messages;
            if (!Array.isArray(messages) || messages.length === 0) {
                return new Response(JSON.stringify({ error: 'No messages provided' }), {
                    status: 400,
                    headers: jsonHeaders,
                });
            }

            // Call OpenAI
            const openaiResponse = await fetch(OPENAI_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: MODEL_ID,
                    messages,
                    temperature: 0.8,
                    max_tokens: 1024,
                }),
            });

            const data = await openaiResponse.text();

            return new Response(data, {
                status: openaiResponse.status,
                headers: jsonHeaders,
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: 'Internal error' }), {
                status: 500,
                headers: jsonHeaders,
            });
        }
    },
};
