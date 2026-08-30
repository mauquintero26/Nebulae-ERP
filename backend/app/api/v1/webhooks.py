from fastapi import APIRouter, Request, Query
from app.api.ws import chat_manager
from fastapi.responses import PlainTextResponse
import json

router = APIRouter()

VERIFY_TOKEN = "nebulae_whatsapp_token_2026"

@router.get("/whatsapp")
def verify_whatsapp(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token")
):
    if hub_mode == "subscribe" and hub_verify_token == VERIFY_TOKEN:
        # Meta expects the challenge to be returned as plain text
        return PlainTextResponse(content=hub_challenge)
    return {"status": "error", "message": "Verification failed"}

@router.post("/whatsapp")
async def receive_whatsapp(request: Request):
    payload = await request.json()
    
    # Very basic parsing for Meta webhook format
    try:
        entry = payload.get("entry", [])[0]
        changes = entry.get("changes", [])[0]
        value = changes.get("value", {})
        messages = value.get("messages", [])
        
        if messages:
            msg = messages[0]
            from_number = msg.get("from")
            text = msg.get("text", {}).get("body", "")
            
            # Here we would normally save to DB (find lead by phone, update SalesOrder status if exists)
            
            # Broadcast to UI (assuming agent '1' handles all for MVP)
            await chat_manager.broadcast(
                json.dumps({
                    "from": from_number,
                    "text": text,
                    "type": "whatsapp_incoming"
                }), 
                "1"
            )
            
    except Exception as e:
        print("Webhook Error:", e)
        
    return {"status": "success"}
