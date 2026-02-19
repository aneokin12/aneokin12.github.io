(function () {
    'use strict';

    // ── Config ──────────────────────────────────────────────
    // Points to your Cloudflare Worker proxy (replace with your Worker URL)
    const WORKER_URL = 'https://aneokin12-github-io.neo-sud.workers.dev';

    // ── DOM refs ─────────────────────────────────────────────
    const messagesEl = document.getElementById('messages');
    const emptyState = document.getElementById('emptyState');
    const userInput = document.getElementById('userInput');
    const askBtn = document.getElementById('askBtn');

    // ── State ────────────────────────────────────────────────
    let conversationHistory = [];

    // ── Chat Helpers ─────────────────────────────────────────
    function removeEmptyState() {
        if (emptyState) emptyState.remove();
    }

    function appendMessage(role, text) {
        removeEmptyState();
        const div = document.createElement('div');
        div.className = 'msg ' + role;
        div.textContent = text;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return div;
    }

    function showTyping() {
        removeEmptyState();
        const div = document.createElement('div');
        div.className = 'msg typing';
        div.id = 'typingIndicator';
        div.textContent = 'Thinking…';
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return div;
    }

    function removeTyping() {
        const el = document.getElementById('typingIndicator');
        if (el) el.remove();
    }

    function showError(msg) {
        const div = document.createElement('div');
        div.className = 'msg error';
        div.textContent = msg;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setLoading(loading) {
        askBtn.disabled = loading;
        userInput.disabled = loading;
    }

    // ── Send Message ─────────────────────────────────────────
    async function sendMessage() {
        const text = userInput.value.trim();
        if (!text) return;

        // Show user message
        appendMessage('user', text);
        userInput.value = '';
        conversationHistory.push({ role: 'user', content: text });

        // Loading state
        setLoading(true);
        const typing = showTyping();

        try {
            const response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: conversationHistory
                })
            });

            removeTyping();

            if (!response.ok) {
                const err = await response.json().catch(function () { return {}; });
                const errMsg = (err.error && err.error.message) || ('API error: ' + response.status);
                showError(errMsg);
                // Remove last user message from history on failure
                conversationHistory.pop();
                return;
            }

            const data = await response.json();
            console.log('API response:', JSON.stringify(data, null, 2)); // DEBUG — remove after fixing
            // Responses API: output is an array of output items
            const outputMsg = data.output && data.output.find(function (o) { return o.type === 'message'; });
            const reply = outputMsg && outputMsg.content && outputMsg.content[0] && outputMsg.content[0].text;

            if (reply) {
                appendMessage('assistant', reply);
                conversationHistory.push({ role: 'assistant', content: reply });
            } else {
                showError('No response received from the model.');
                conversationHistory.pop();
            }
        } catch (err) {
            removeTyping();
            showError('Network error — check your connection and try again.');
            conversationHistory.pop();
        } finally {
            setLoading(false);
            userInput.focus();
        }
    }

    // ── Event Listeners ──────────────────────────────────────
    askBtn.addEventListener('click', sendMessage);

    userInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Focus input on load
    userInput.focus();
})();
