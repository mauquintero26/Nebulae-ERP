import importlib


def test_chatwoot_token_has_no_real_fallback(monkeypatch):
    monkeypatch.delenv("CHATWOOT_API_TOKEN", raising=False)
    import app.api.v1.chat as chat_module
    importlib.reload(chat_module)
    try:
        assert chat_module.CHATWOOT_API_TOKEN == ""
    finally:
        importlib.reload(chat_module)
