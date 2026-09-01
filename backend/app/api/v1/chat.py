from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.database import get_db
import datetime, secrets, json

router = APIRouter()

# ─── Helpers ──────────────────────────────────────────────────────────────────
def _conv_to_dict(row):
    """Convert a DB row (dict-like) to API dict."""
    return {
        "id":             row["id"],
        "channel":        row["channel"],
        "customer_id":    row["customer_id"],
        "customer_name":  row["customer_name"],
        "customer_email": row["customer_email"],
        "customer_phone": row["customer_phone"],
        "status":         row["status"],
        "unread_count":   row["unread_count"],
        "last_message":   row["last_message"],
        "last_message_at": row["last_message_at"].isoformat() if row["last_message_at"] else None,
        "ai_mode":        row["ai_mode"],
        "linked_lead_id": row["linked_lead_id"],
        "session_token":  row["session_token"],
        "created_at":     row["created_at"].isoformat() if row["created_at"] else None,
    }

def _msg_to_dict(row):
    return {
        "id":             row["id"],
        "conversation_id": row["conversation_id"],
        "direction":      row["direction"],
        "content":        row["content"],
        "message_type":   row["message_type"],
        "sender_name":    row["sender_name"],
        "is_ai_generated": row["is_ai_generated"],
        "is_auto_sent":   row["is_auto_sent"],
        "created_at":     row["created_at"].isoformat() if row["created_at"] else None,
    }

# ─── GET /conversations — Inbox ────────────────────────────────────────────────
@router.get("/conversations", response_model=dict)
def get_conversations(
    db: Session = Depends(get_db),
    channel: str = None,
    status: str = "open",
    search: str = None,
    limit: int = 50,
    offset: int = 0,
):
    """Fetch inbox: list of conversations ordered by last activity."""
    q = """
        SELECT c.*, cu.id as cust_id
        FROM chat_conversations c
        LEFT JOIN customers cu ON c.customer_id = cu.id
        WHERE 1=1
    """
    params = {}
    if channel and channel != "all":
        q += " AND c.channel = :channel"
        params["channel"] = channel
    if status:
        q += " AND c.status = :status"
        params["status"] = status
    if search:
        q += " AND (c.customer_name ILIKE :search OR c.last_message ILIKE :search)"
        params["search"] = f"%{search}%"
    q += " ORDER BY c.last_message_at DESC NULLS LAST LIMIT :limit OFFSET :offset"
    params["limit"] = limit
    params["offset"] = offset

    rows = db.execute(text(q), params).mappings().all()
    total_q = "SELECT COUNT(*) FROM chat_conversations WHERE status = :status"
    total_params = {"status": status}
    if channel and channel != "all":
        total_q += " AND channel = :channel"
        total_params["channel"] = channel
    total = db.execute(text(total_q), total_params).scalar()

    return {
        "status": "success",
        "data": [_conv_to_dict(r) for r in rows],
        "total": total,
        "unread_total": sum(r["unread_count"] for r in rows),
    }


# ─── GET /conversations/{id}/messages ─────────────────────────────────────────
@router.get("/conversations/{conv_id}/messages", response_model=dict)
def get_messages(conv_id: int, db: Session = Depends(get_db), since: str = None):
    """Get messages for a conversation. Supports `since` ISO timestamp for polling."""
    # Mark as read
    db.execute(text(
        "UPDATE chat_conversations SET unread_count=0 WHERE id=:id"
    ), {"id": conv_id})
    db.commit()

    q = "SELECT * FROM chat_messages WHERE conversation_id=:cid"
    params = {"cid": conv_id}
    if since:
        q += " AND created_at > :since"
        params["since"] = since
    q += " ORDER BY created_at ASC"

    rows = db.execute(text(q), params).mappings().all()

    # Get conversation
    conv = db.execute(text(
        "SELECT * FROM chat_conversations WHERE id=:id"
    ), {"id": conv_id}).mappings().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {
        "status": "success",
        "conversation": _conv_to_dict(conv),
        "messages": [_msg_to_dict(m) for m in rows],
    }


# ─── POST /conversations/{id}/reply — Agent reply ─────────────────────────────
@router.post("/conversations/{conv_id}/reply", response_model=dict)
def reply_to_conversation(conv_id: int, body: dict, db: Session = Depends(get_db)):
    """Agent (human or AI) replies to a conversation."""
    content = body.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content required")

    is_ai = body.get("is_ai_generated", False)
    is_auto = body.get("is_auto_sent", False)

    # Insert message
    result = db.execute(text("""
        INSERT INTO chat_messages
            (conversation_id, direction, content, sender_name, is_ai_generated, is_auto_sent)
        VALUES (:cid, 'out', :content, :sender, :ai, :auto)
        RETURNING id, created_at
    """), {
        "cid": conv_id,
        "content": content,
        "sender": "Agente IA" if is_ai else "Asesor",
        "ai": is_ai,
        "auto": is_auto,
    }).mappings().first()

    db.execute(text("""
        UPDATE chat_conversations
        SET last_message=:msg, last_message_at=NOW(), updated_at=NOW()
        WHERE id=:id
    """), {"msg": content[:120], "id": conv_id})
    db.commit()

    return {
        "status": "success",
        "data": {
            "id": result["id"],
            "conversation_id": conv_id,
            "direction": "out",
            "content": content,
            "sender_name": "Agente IA" if is_ai else "Asesor",
            "is_ai_generated": is_ai,
            "is_auto_sent": is_auto,
            "created_at": result["created_at"].isoformat(),
        }
    }


# ─── POST /conversations/{id}/ai-mode ─────────────────────────────────────────
@router.patch("/conversations/{conv_id}/ai-mode", response_model=dict)
def set_ai_mode(conv_id: int, body: dict, db: Session = Depends(get_db)):
    """Toggle AI mode: 'auto' or 'suggestion'."""
    mode = body.get("mode", "suggestion")
    if mode not in ("auto", "suggestion", "off"):
        raise HTTPException(status_code=400, detail="mode must be auto|suggestion|off")
    db.execute(text(
        "UPDATE chat_conversations SET ai_mode=:mode, updated_at=NOW() WHERE id=:id"
    ), {"mode": mode, "id": conv_id})
    db.commit()
    return {"status": "success", "data": {"conv_id": conv_id, "ai_mode": mode}}


# ─── POST /conversations/{id}/link-customer ───────────────────────────────────
@router.patch("/conversations/{conv_id}/link-customer", response_model=dict)
def link_customer(conv_id: int, body: dict, db: Session = Depends(get_db)):
    """Link a conversation to an existing customer record."""
    customer_id = body.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="customer_id required")
    # Verify customer exists
    cust = db.execute(text(
        "SELECT id, first_name, last_name FROM customers WHERE id=:id"
    ), {"id": customer_id}).mappings().first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.execute(text("""
        UPDATE chat_conversations
        SET customer_id=:cid, customer_name=:name, updated_at=NOW()
        WHERE id=:id
    """), {
        "cid": customer_id,
        "name": f"{cust['first_name']} {cust['last_name']}",
        "id": conv_id
    })
    db.commit()
    return {"status": "success", "data": {"conv_id": conv_id, "customer_id": customer_id}}


# ─── POST /conversations/{id}/link-lead ───────────────────────────────────────
@router.patch("/conversations/{conv_id}/link-lead", response_model=dict)
def link_lead(conv_id: int, body: dict, db: Session = Depends(get_db)):
    """Link a conversation to a CRM lead/sales order."""
    lead_id = body.get("lead_id")
    db.execute(text(
        "UPDATE chat_conversations SET linked_lead_id=:lid, updated_at=NOW() WHERE id=:id"
    ), {"lid": lead_id, "id": conv_id})
    db.commit()
    return {"status": "success", "data": {"conv_id": conv_id, "linked_lead_id": lead_id}}


# ─── GET /conversations/{id}/ai-context ──────────────────────────────────────
@router.get("/conversations/{conv_id}/ai-context", response_model=dict)
def get_ai_context(conv_id: int, db: Session = Depends(get_db)):
    """Build full context for AI: customer info + CRM history + conversation."""
    conv = db.execute(text(
        "SELECT * FROM chat_conversations WHERE id=:id"
    ), {"id": conv_id}).mappings().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")

    # Last 20 messages
    msgs = db.execute(text("""
        SELECT direction, content, sender_name, created_at
        FROM chat_messages WHERE conversation_id=:cid
        ORDER BY created_at DESC LIMIT 20
    """), {"cid": conv_id}).mappings().all()

    # Customer info + CRM leads
    customer_ctx = None
    leads_ctx = []
    if conv["customer_id"]:
        cust = db.execute(text(
            "SELECT * FROM customers WHERE id=:id"
        ), {"id": conv["customer_id"]}).mappings().first()
        if cust:
            customer_ctx = {
                "id": cust["id"],
                "name": f"{cust['first_name']} {cust['last_name']}",
                "email": cust.get("email"),
                "phone": cust.get("phone"),
                "city": cust.get("city"),
            }
        # CRM leads for this customer
        leads = db.execute(text("""
            SELECT so.id, so.status, so.lead_description, so.lead_value,
                   so.solicitud_tipo, so.lead_product_name, so.advisor_name,
                   ps.name as stage_name
            FROM sales_orders so
            LEFT JOIN pipeline_stages ps ON so.pipeline_stage_id = ps.id
            WHERE so.customer_id = :cid AND so.status != 'CANCELLED'
            ORDER BY so.created_at DESC LIMIT 10
        """), {"cid": conv["customer_id"]}).mappings().all()
        leads_ctx = [dict(l) for l in leads]

    # Build context string for AI prompt
    context_lines = [
        f"Cliente: {conv['customer_name']}",
        f"Canal: {conv['channel']}",
        f"Estado IA: {conv['ai_mode']}",
    ]
    if customer_ctx:
        context_lines.append(f"Email: {customer_ctx.get('email', 'N/A')}")
        context_lines.append(f"Teléfono: {customer_ctx.get('phone', 'N/A')}")
    if leads_ctx:
        context_lines.append(f"\nHistorial CRM ({len(leads_ctx)} registros):")
        for l in leads_ctx[:5]:
            context_lines.append(
                f"  - {l.get('stage_name','?')} | {l.get('solicitud_tipo','?')} | {l.get('lead_product_name','?')} | ${l.get('lead_value',0):,}"
            )
    if msgs:
        context_lines.append(f"\nÚltimos mensajes:")
        for m in reversed(list(msgs)[-10:]):
            role = "Cliente" if m["direction"] == "in" else "Asesor"
            context_lines.append(f"  [{role}]: {m['content'][:100]}")

    return {
        "status": "success",
        "data": {
            "conversation": _conv_to_dict(conv),
            "customer": customer_ctx,
            "crm_leads": leads_ctx,
            "messages": [_msg_to_dict(m) for m in msgs],
            "context_string": "\n".join(context_lines),
        }
    }


# ─── POST /conversations/{id}/ai-suggest ─────────────────────────────────────
@router.post("/conversations/{conv_id}/ai-suggest", response_model=dict)
def ai_suggest(conv_id: int, body: dict, db: Session = Depends(get_db)):
    """
    Generate an AI suggestion based on context.
    For now returns a rule-based response. 
    Replace with Gemini/GPT call when API key is available.
    """
    # Get context
    conv = db.execute(text(
        "SELECT * FROM chat_conversations WHERE id=:id"
    ), {"id": conv_id}).mappings().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")

    last_msg = db.execute(text("""
        SELECT content FROM chat_messages 
        WHERE conversation_id=:cid AND direction='in'
        ORDER BY created_at DESC LIMIT 1
    """), {"cid": conv_id}).scalar()

    # Rule-based suggestions (replace with LLM call)
    suggestion = _rule_based_suggestion(last_msg or "", conv["customer_name"])

    return {
        "status": "success",
        "data": {
            "suggestion": suggestion,
            "context": {
                "customer_name": conv["customer_name"],
                "channel": conv["channel"],
                "ai_mode": conv["ai_mode"],
            }
        }
    }

def _rule_based_suggestion(last_message: str, customer_name: str) -> str:
    """Simple rule-based AI suggestions. Replace with LLM for production."""
    msg = last_message.lower()
    name = customer_name.split()[0] if customer_name else "cliente"
    
    if any(w in msg for w in ["precio", "costo", "cuánto", "cuanto", "vale"]):
        return f"Hola {name}! Con mucho gusto te comparto los precios. ¿Cuál producto te interesa específicamente? Tenemos diferentes opciones disponibles."
    elif any(w in msg for w in ["disponib", "stock", "tienen", "hay"]):
        return f"{name}, verifico disponibilidad de inmediato. ¿Tienes alguna referencia o modelo específico en mente?"
    elif any(w in msg for w in ["envío", "envio", "domicilio", "despacho", "llega"]):
        return f"Manejamos envíos a todo el país {name}. El tiempo de entrega es de 2-5 días hábiles. ¿A qué ciudad sería el envío?"
    elif any(w in msg for w in ["pago", "pagar", "transferencia", "nequi", "daviplata"]):
        return f"Aceptamos pagos por transferencia bancaria, Nequi y Daviplata {name}. ¿Con cuál método prefieres realizar tu compra?"
    elif any(w in msg for w in ["gracias", "perfecto", "listo", "ok", "okay"]):
        return f"¡Con mucho gusto {name}! ¿Hay algo más en lo que pueda ayudarte?"
    elif any(w in msg for w in ["hola", "buenos", "buenas", "buen dia"]):
        return f"¡Hola {name}! Bienvenido/a a Nebulae Kids. ¿En qué te puedo ayudar hoy?"
    else:
        return f"Entiendo {name}. Déjame verificar esa información para darte la mejor respuesta. ¿Puedo preguntarte algo más sobre lo que necesitas?"


# ══ WEB CHAT (público) ════════════════════════════════════════════════════════

@router.post("/web/start", response_model=dict)
def start_web_chat(body: dict, db: Session = Depends(get_db)):
    """
    Start a new web chat session. Called from the public widget.
    Returns a session_token for subsequent messages.
    """
    name = body.get("customer_name", "Visitante Web").strip() or "Visitante Web"
    email = body.get("customer_email", "").strip() or None
    phone = body.get("customer_phone", "").strip() or None

    # Generate unique session token
    token = secrets.token_urlsafe(32)

    result = db.execute(text("""
        INSERT INTO chat_conversations
            (channel, customer_name, customer_email, customer_phone, status, 
             ai_mode, session_token, last_message, last_message_at)
        VALUES ('web', :name, :email, :phone, 'open', 
                'suggestion', :token, 'Chat iniciado', NOW())
        RETURNING id, session_token, created_at
    """), {
        "name": name, "email": email, "phone": phone, "token": token
    }).mappings().first()
    db.commit()

    conv_id = result["id"]

    # Auto-welcome message from system
    db.execute(text("""
        INSERT INTO chat_messages (conversation_id, direction, content, sender_name, is_ai_generated)
        VALUES (:cid, 'out', :msg, 'Nebulae Kids', TRUE)
    """), {
        "cid": conv_id,
        "msg": f"¡Hola {name}! 👋 Bienvenido/a a Nebulae Kids. Estamos aquí para ayudarte. ¿En qué podemos servirte hoy?"
    })
    db.commit()

    return {
        "status": "success",
        "data": {
            "conversation_id": conv_id,
            "session_token": token,
            "customer_name": name,
        }
    }


@router.post("/web/message", response_model=dict)
def send_web_message(body: dict, db: Session = Depends(get_db)):
    """
    Public: send a message from the web chat widget.
    Identified by session_token.
    """
    token = body.get("session_token", "")
    content = body.get("content", "").strip()
    if not token or not content:
        raise HTTPException(status_code=400, detail="session_token and content required")

    # Look up conversation
    conv = db.execute(text(
        "SELECT * FROM chat_conversations WHERE session_token=:token AND channel='web'"
    ), {"token": token}).mappings().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Session not found")

    conv_id = conv["id"]

    # Save incoming message
    result = db.execute(text("""
        INSERT INTO chat_messages (conversation_id, direction, content, sender_name)
        VALUES (:cid, 'in', :content, :name)
        RETURNING id, created_at
    """), {
        "cid": conv_id,
        "content": content,
        "name": conv["customer_name"],
    }).mappings().first()

    # Update conversation
    db.execute(text("""
        UPDATE chat_conversations
        SET last_message=:msg, last_message_at=NOW(), 
            unread_count=unread_count+1, updated_at=NOW()
        WHERE id=:id
    """), {"msg": content[:120], "id": conv_id})
    db.commit()

    # If auto mode, generate AI response immediately
    ai_reply = None
    if conv["ai_mode"] == "auto":
        suggestion = _rule_based_suggestion(content, conv["customer_name"])
        ai_result = db.execute(text("""
            INSERT INTO chat_messages
                (conversation_id, direction, content, sender_name, is_ai_generated, is_auto_sent)
            VALUES (:cid, 'out', :content, 'Agente IA', TRUE, TRUE)
            RETURNING id, created_at
        """), {"cid": conv_id, "content": suggestion}).mappings().first()
        db.execute(text("""
            UPDATE chat_conversations 
            SET last_message=:msg, last_message_at=NOW(), updated_at=NOW()
            WHERE id=:id
        """), {"msg": suggestion[:120], "id": conv_id})
        db.commit()
        ai_reply = {
            "id": ai_result["id"],
            "direction": "out",
            "content": suggestion,
            "sender_name": "Agente IA",
            "is_ai_generated": True,
            "created_at": ai_result["created_at"].isoformat(),
        }

    return {
        "status": "success",
        "data": {
            "id": result["id"],
            "conversation_id": conv_id,
            "direction": "in",
            "content": content,
            "created_at": result["created_at"].isoformat(),
        },
        "ai_reply": ai_reply,
    }


@router.get("/web/messages/{token}", response_model=dict)
def get_web_messages(
    token: str, 
    db: Session = Depends(get_db),
    since: str = None,
):
    """
    Public: get messages for a web chat session (polling endpoint).
    The widget calls this every 2-3 seconds to get new responses.
    """
    conv = db.execute(text(
        "SELECT id, customer_name FROM chat_conversations WHERE session_token=:token"
    ), {"token": token}).mappings().first()
    if not conv:
        raise HTTPException(status_code=404, detail="Session not found")

    q = "SELECT * FROM chat_messages WHERE conversation_id=:cid"
    params = {"cid": conv["id"]}
    if since:
        q += " AND created_at > :since"
        params["since"] = since
    q += " ORDER BY created_at ASC"

    rows = db.execute(text(q), params).mappings().all()
    return {
        "status": "success",
        "data": [_msg_to_dict(m) for m in rows]
    }


# ── Webhook stubs (WhatsApp, Instagram) ──────────────────────────────────────

@router.post("/webhook/whatsapp", response_model=dict)
def whatsapp_webhook(body: dict, db: Session = Depends(get_db)):
    """
    WhatsApp Business API webhook.
    TODO: Validate X-Hub-Signature-256 header.
    TODO: Parse actual WhatsApp message format.
    """
    # Extract message data (WhatsApp format)
    try:
        entry = body.get("entry", [{}])[0]
        changes = entry.get("changes", [{}])[0]
        value = changes.get("value", {})
        messages = value.get("messages", [])
        
        for msg in messages:
            phone = msg.get("from", "")
            text_content = msg.get("text", {}).get("body", "")
            wa_id = msg.get("id", "")
            
            if not text_content:
                continue
            
            # Find or create conversation
            conv = db.execute(text(
                "SELECT id FROM chat_conversations WHERE channel='whatsapp' AND customer_phone=:phone AND status='open'"
            ), {"phone": phone}).mappings().first()
            
            if not conv:
                result = db.execute(text("""
                    INSERT INTO chat_conversations
                        (channel, customer_name, customer_phone, status, ai_mode, last_message)
                    VALUES ('whatsapp', :name, :phone, 'open', 'suggestion', :msg)
                    RETURNING id
                """), {
                    "name": f"WA +{phone}", 
                    "phone": phone,
                    "msg": text_content[:120]
                }).mappings().first()
                conv_id = result["id"]
            else:
                conv_id = conv["id"]
            
            # Save message
            db.execute(text("""
                INSERT INTO chat_messages (conversation_id, direction, content, sender_name, metadata)
                VALUES (:cid, 'in', :content, :phone, :meta)
            """), {
                "cid": conv_id, 
                "content": text_content, 
                "phone": f"+{phone}",
                "meta": json.dumps({"wa_id": wa_id})
            })
            db.execute(text("""
                UPDATE chat_conversations
                SET last_message=:msg, last_message_at=NOW(), unread_count=unread_count+1
                WHERE id=:id
            """), {"msg": text_content[:120], "id": conv_id})
        
        db.commit()
    except Exception as e:
        # Never fail webhooks — WhatsApp retries on 5xx
        print(f"WhatsApp webhook error: {e}")
    
    return {"status": "success"}


@router.get("/webhook/whatsapp", response_model=dict)
def whatsapp_webhook_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """WhatsApp webhook verification (required by Meta)."""
    VERIFY_TOKEN = "nebulae_whatsapp_2026"
    if hub_mode == "subscribe" and hub_verify_token == VERIFY_TOKEN:
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(content=hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook/instagram", response_model=dict)
def instagram_webhook(body: dict, db: Session = Depends(get_db)):
    """
    Instagram Messaging webhook.
    TODO: Validate X-Hub-Signature-256 header.
    """
    try:
        entries = body.get("entry", [])
        for entry in entries:
            messaging = entry.get("messaging", [])
            for event in messaging:
                sender_id = event.get("sender", {}).get("id", "")
                message = event.get("message", {})
                text_content = message.get("text", "")
                
                if not text_content:
                    continue
                
                conv = db.execute(text(
                    "SELECT id FROM chat_conversations WHERE channel='instagram' AND external_id=:eid AND status='open'"
                ), {"eid": sender_id}).mappings().first()
                
                if not conv:
                    result = db.execute(text("""
                        INSERT INTO chat_conversations
                            (channel, external_id, customer_name, status, ai_mode, last_message)
                        VALUES ('instagram', :eid, :name, 'open', 'suggestion', :msg)
                        RETURNING id
                    """), {
                        "eid": sender_id,
                        "name": f"IG User",
                        "msg": text_content[:120]
                    }).mappings().first()
                    conv_id = result["id"]
                else:
                    conv_id = conv["id"]
                
                db.execute(text("""
                    INSERT INTO chat_messages (conversation_id, direction, content, sender_name)
                    VALUES (:cid, 'in', :content, 'Instagram User')
                """), {"cid": conv_id, "content": text_content})
                db.execute(text("""
                    UPDATE chat_conversations
                    SET last_message=:msg, last_message_at=NOW(), unread_count=unread_count+1
                    WHERE id=:id
                """), {"msg": text_content[:120], "id": conv_id})
        
        db.commit()
    except Exception as e:
        print(f"Instagram webhook error: {e}")
    
    return {"status": "success"}


# ─── GET /conversations (close) ───────────────────────────────────────────────
@router.patch("/conversations/{conv_id}/status", response_model=dict)
def update_conv_status(conv_id: int, body: dict, db: Session = Depends(get_db)):
    """Open, close, or put conversation on hold."""
    status = body.get("status", "open")
    if status not in ("open", "closed", "hold"):
        raise HTTPException(status_code=400, detail="status must be open|closed|hold")
    db.execute(text(
        "UPDATE chat_conversations SET status=:s, updated_at=NOW() WHERE id=:id"
    ), {"s": status, "id": conv_id})
    db.commit()
    return {"status": "success", "data": {"conv_id": conv_id, "status": status}}
