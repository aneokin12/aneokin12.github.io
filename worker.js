// SudGPT — Cloudflare Worker Proxy
// Securely proxies chat requests to OpenAI without exposing the API key.
//
// Environment variables (set in Cloudflare dashboard as secrets):
//   OPENAI_API_KEY  — your OpenAI project API key
//
// Deploy: paste this into a Cloudflare Worker, add the secret, done.

const MODEL_ID = 'ft:gpt-4.1-nano-2025-04-14:personal:sudgpt:DAo8jl7J';
const PROMPT_ID = 'pmpt_6996a49e70108196a7572766a39f57e405934dc10ec9e4a8';
const PROMPT_VERSION = '2';
const OPENAI_URL = 'https://api.openai.com/v1/responses';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*', // Allow all origins for local testing
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
};

function handleOptions(request) {
    // If this is a proper CORS preflight, echo back the requested headers
    if (
        request.headers.get('Origin') !== null &&
        request.headers.get('Access-Control-Request-Method') !== null &&
        request.headers.get('Access-Control-Request-Headers') !== null
    ) {
        return new Response(null, {
            status: 204,
            headers: {
                ...CORS_HEADERS,
                'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers'),
            },
        });
    } else {
        // Standard OPTIONS request (not CORS preflight)
        return new Response(null, {
            headers: { Allow: 'POST, OPTIONS' },
        });
    }
}

export default {
    async fetch(request, env) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return handleOptions(request);
        }

        const jsonHeaders = {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            'Vary': 'Origin',
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
            const input = body.messages;
            if (!Array.isArray(input) || input.length === 0) {
                return new Response(JSON.stringify({ error: 'No messages provided' }), {
                    status: 400,
                    headers: jsonHeaders,
                });
            }

            // Call OpenAI Responses API with stored prompt
            const openaiResponse = await fetch(OPENAI_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: MODEL_ID,
                    input,
                    prompt: {
                        id: PROMPT_ID,
                        version: PROMPT_VERSION,
                    },
                    temperature: 0.8,
                    max_output_tokens: 1024,
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
