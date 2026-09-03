from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.api.dependencies import get_db
from typing import Optional
import datetime, json as json_mod

router = APIRouter()

def _now():
    return datetime.datetime.utcnow()

def _ensure_marketing_tables(db: Session):
    db.execute(text("""
    CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        numero VARCHAR(20) UNIQUE,
        nombre VARCHAR(200) NOT NULL,
        tipo VARCHAR(30) DEFAULT 'OMNICANAL',
        estado VARCHAR(30) DEFAULT 'BORRADOR',
        fecha_inicio DATE,
        fecha_fin DATE,
        presupuesto_cop NUMERIC(14,2) DEFAULT 0,
        objetivo TEXT,
        canales JSONB DEFAULT '[]',
        descripcion TEXT,
        codigo_descuento VARCHAR(50),
        descuento_pct NUMERIC(5,2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS campaign_leads (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
        lead_name VARCHAR(200),
        lead_email VARCHAR(200),
        lead_phone VARCHAR(50),
        source_channel VARCHAR(50) DEFAULT 'MANUAL',
        estado VARCHAR(30) DEFAULT 'NUEVO',
        venta_atribuida_cop NUMERIC(14,2) DEFAULT 0,
        crm_lead_id INTEGER,
        notas TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS automation_flows (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        canal VARCHAR(30) DEFAULT 'INSTAGRAM',
        trigger_keyword VARCHAR(100),
        estado VARCHAR(20) DEFAULT 'INACTIVO',
        acciones JSONB DEFAULT '[]',
        descripcion TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS social_posts (
        id SERIAL PRIMARY KEY,
        tipo VARCHAR(30) DEFAULT 'HISTORIA',
        producto_id INTEGER,
        producto_nombre VARCHAR(200),
        precio_cop NUMERIC(14,2),
        descuento_pct NUMERIC(5,2) DEFAULT 0,
        canales JSONB DEFAULT '[]',
        caption TEXT,
        imagen_url TEXT,
        formato VARCHAR(50) DEFAULT 'minimalista',
        programado_para TIMESTAMPTZ,
        estado VARCHAR(30) DEFAULT 'BORRADOR',
        campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
        interacciones INTEGER DEFAULT 0,
        leads_generados INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS story_catalog (
        id SERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES social_posts(id) ON DELETE CASCADE,
        producto_nombre VARCHAR(200),
        precio_cop NUMERIC(14,2),
        imagen_url TEXT,
        canal VARCHAR(30),
        publicado_en TIMESTAMPTZ DEFAULT now(),
        activo BOOLEAN DEFAULT TRUE
    );
    CREATE SEQUENCE IF NOT EXISTS seq_mkt_campana START 1;
    """))
    db.commit()

def _next_mkt_num(db: Session) -> str:
    row = db.execute(text("SELECT nextval('seq_mkt_campana')")).fetchone()
    year = datetime.datetime.utcnow().year
    return f"MKT-{year}{int(row[0]):04d}"

# ─── STATS ───────────────────────────────────────────────────────────────────
@router.get("/stats")
def marketing_stats(db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    campanas_activas = db.execute(text("SELECT COUNT(*) FROM campaigns WHERE estado='ACTIVA'")).scalar() or 0
    campanas_total   = db.execute(text("SELECT COUNT(*) FROM campaigns")).scalar() or 0
    leads_total      = db.execute(text("SELECT COUNT(*) FROM campaign_leads")).scalar() or 0
    leads_convertidos= db.execute(text("SELECT COUNT(*) FROM campaign_leads WHERE estado='CONVERTIDO'")).scalar() or 0
    ventas_atribuidas= db.execute(text("SELECT COALESCE(SUM(venta_atribuida_cop),0) FROM campaign_leads")).scalar() or 0
    presupuesto_total= db.execute(text("SELECT COALESCE(SUM(presupuesto_cop),0) FROM campaigns WHERE estado IN ('ACTIVA','FINALIZADA')")).scalar() or 0
    posts_hoy        = db.execute(text("SELECT COUNT(*) FROM social_posts WHERE DATE(created_at)=CURRENT_DATE")).scalar() or 0
    posts_total      = db.execute(text("SELECT COUNT(*) FROM social_posts WHERE estado='PUBLICADO'")).scalar() or 0
    flujos_activos   = db.execute(text("SELECT COUNT(*) FROM automation_flows WHERE estado='ACTIVO'")).scalar() or 0
    roi = round((float(ventas_atribuidas) / float(presupuesto_total) * 100 - 100), 1) if float(presupuesto_total) > 0 else 0
    tasa_conversion = round(float(leads_convertidos) / float(leads_total) * 100, 1) if leads_total > 0 else 0
    return {"status": "success", "data": {
        "campanas_activas": int(campanas_activas),
        "campanas_total":   int(campanas_total),
        "leads_total":      int(leads_total),
        "leads_convertidos":int(leads_convertidos),
        "ventas_atribuidas_cop": float(ventas_atribuidas),
        "presupuesto_total_cop": float(presupuesto_total),
        "roi_pct":          roi,
        "tasa_conversion_pct": tasa_conversion,
        "posts_hoy":        int(posts_hoy),
        "posts_total":      int(posts_total),
        "flujos_activos":   int(flujos_activos),
    }}

# ─── CAMPAÑAS ─────────────────────────────────────────────────────────────────
@router.get("/campanas")
def list_campanas(db: Session = Depends(get_db), estado: Optional[str] = None, search: Optional[str] = None, limit: int = 100):
    _ensure_marketing_tables(db)
    q = "SELECT c.*, (SELECT COUNT(*) FROM campaign_leads cl WHERE cl.campaign_id=c.id) AS leads_count, (SELECT COALESCE(SUM(cl2.venta_atribuida_cop),0) FROM campaign_leads cl2 WHERE cl2.campaign_id=c.id AND cl2.estado='CONVERTIDO') AS ventas_cop FROM campaigns c WHERE 1=1"
    params: dict = {}
    if estado:
        q += " AND c.estado=:estado"; params["estado"] = estado
    if search:
        q += " AND (c.nombre ILIKE :s OR c.numero ILIKE :s OR c.codigo_descuento ILIKE :s)"; params["s"] = f"%{search}%"
    q += " ORDER BY c.created_at DESC LIMIT :limit"; params["limit"] = limit
    rows = db.execute(text(q), params).mappings().all()
    data = []
    for r in rows:
        d = dict(r)
        d["canales"] = d.get("canales") or []
        data.append(d)
    return {"status": "success", "total": len(data), "data": data}

@router.get("/campanas/{campana_id}")
def get_campana(campana_id: int, db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    row = db.execute(text("SELECT * FROM campaigns WHERE id=:id"), {"id": campana_id}).mappings().first()
    if not row: raise HTTPException(404, "Campaña no encontrada")
    d = dict(row); d["canales"] = d.get("canales") or []
    leads = db.execute(text("SELECT * FROM campaign_leads WHERE campaign_id=:id ORDER BY created_at DESC"), {"id": campana_id}).mappings().all()
    d["leads"] = [dict(l) for l in leads]
    return {"status": "success", "data": d}

@router.post("/campanas")
def create_campana(body: dict, db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    num = _next_mkt_num(db)
    canales = body.get("canales", [])
    db.execute(text("""
        INSERT INTO campaigns (numero, nombre, tipo, estado, fecha_inicio, fecha_fin, presupuesto_cop, objetivo, canales, descripcion, codigo_descuento, descuento_pct)
        VALUES (:num, :nombre, :tipo, :estado, :fi, :ff, :pres, :obj, :canales::jsonb, :desc, :cod, :dpct)
    """), {
        "num": num, "nombre": body.get("nombre","Nueva Campaña"), "tipo": body.get("tipo","OMNICANAL"),
        "estado": body.get("estado","BORRADOR"), "fi": body.get("fecha_inicio"), "ff": body.get("fecha_fin"),
        "pres": body.get("presupuesto_cop", 0), "obj": body.get("objetivo",""),
        "canales": json_mod.dumps(canales), "desc": body.get("descripcion",""),
        "cod": body.get("codigo_descuento"), "dpct": body.get("descuento_pct", 0),
    })
    db.commit()
    row = db.execute(text("SELECT * FROM campaigns WHERE numero=:num"), {"num": num}).mappings().first()
    return {"status": "success", "data": dict(row)}

@router.patch("/campanas/{campana_id}")
def update_campana(campana_id: int, body: dict, db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    allowed = ["nombre","tipo","estado","fecha_inicio","fecha_fin","presupuesto_cop","objetivo","canales","descripcion","codigo_descuento","descuento_pct"]
    sets = []
    params: dict = {"id": campana_id}
    for k, v in body.items():
        if k in allowed:
            if k == "canales":
                sets.append(f"{k}=:{k}::jsonb"); params[k] = json_mod.dumps(v)
            else:
                sets.append(f"{k}=:{k}"); params[k] = v
    if not sets:
        raise HTTPException(400, "Nada que actualizar")
    sets.append("updated_at=now()")
    db.execute(text(f"UPDATE campaigns SET {','.join(sets)} WHERE id=:id"), params)
    db.commit()
    row = db.execute(text("SELECT * FROM campaigns WHERE id=:id"), {"id": campana_id}).mappings().first()
    d = dict(row); d["canales"] = d.get("canales") or []
    return {"status": "success", "data": d}

@router.delete("/campanas/{campana_id}")
def delete_campana(campana_id: int, db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    db.execute(text("DELETE FROM campaigns WHERE id=:id"), {"id": campana_id})
    db.commit()
    return {"status": "success", "data": {"deleted": campana_id}}

@router.post("/campanas/{campana_id}/launch")
def launch_campana(campana_id: int, db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    db.execute(text("UPDATE campaigns SET estado='ACTIVA', updated_at=now() WHERE id=:id"), {"id": campana_id})
    db.commit()
    return {"status": "success", "data": {"estado": "ACTIVA", "message": "Campaña lanzada exitosamente"}}

@router.post("/campanas/{campana_id}/pause")
def pause_campana(campana_id: int, db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    db.execute(text("UPDATE campaigns SET estado='PAUSADA', updated_at=now() WHERE id=:id"), {"id": campana_id})
    db.commit()
    return {"status": "success", "data": {"estado": "PAUSADA"}}
# ─── LEADS DE CAMPAÑA ────────────────────────────────────────────────────────
@router.get("/campanas/{campana_id}/leads")
def list_campaign_leads(campana_id: int, db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    rows = db.execute(text("SELECT * FROM campaign_leads WHERE campaign_id=:id ORDER BY created_at DESC"), {"id": campana_id}).mappings().all()
    return {"status": "success", "data": [dict(r) for r in rows]}

@router.post("/campanas/{campana_id}/leads")
def add_campaign_lead(campana_id: int, body: dict, db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    row = db.execute(text("""
        INSERT INTO campaign_leads (campaign_id, lead_name, lead_email, lead_phone, source_channel, estado, notas)
        VALUES (:cid, :name, :email, :phone, :source, :estado, :notas)
        RETURNING *
    """), {
        "cid": campana_id, "name": body.get("lead_name",""), "email": body.get("lead_email"),
        "phone": body.get("lead_phone"), "source": body.get("source_channel","MANUAL"),
        "estado": body.get("estado","NUEVO"), "notas": body.get("notas",""),
    }).mappings().first()
    db.commit()
    return {"status": "success", "data": dict(row)}

@router.patch("/campanas/{campana_id}/leads/{lead_id}")
def update_campaign_lead(campana_id: int, lead_id: int, body: dict, db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    allowed = ["estado","venta_atribuida_cop","notas","crm_lead_id"]
    sets = []; params: dict = {"id": lead_id, "cid": campana_id}
    for k, v in body.items():
        if k in allowed:
            sets.append(f"{k}=:{k}"); params[k] = v
    if sets:
        db.execute(text(f"UPDATE campaign_leads SET {','.join(sets)} WHERE id=:id AND campaign_id=:cid"), params)
        db.commit()
    row = db.execute(text("SELECT * FROM campaign_leads WHERE id=:id"), {"id": lead_id}).mappings().first()
    return {"status": "success", "data": dict(row) if row else {}}

@router.post("/leads/crm-sync")
def sync_lead_to_crm(body: dict, db: Session = Depends(get_db)):
    """Crea un lead en el pipeline CRM desde un campaign_lead"""
    _ensure_marketing_tables(db)
    from app.models.erp_documents import SaleOrder
    from app.models.customers import Customer
    lead_id = body.get("lead_id")
    if not lead_id:
        raise HTTPException(400, "lead_id requerido")
    row = db.execute(text("SELECT * FROM campaign_leads WHERE id=:id"), {"id": lead_id}).mappings().first()
    if not row:
        raise HTTPException(404, "Lead no encontrado")
    r = dict(row)
    # Get or create CRM stage (first pipeline stage)
    stage_row = db.execute(text("SELECT id FROM pipeline_stages ORDER BY position ASC LIMIT 1")).mappings().first()
    stage_id = stage_row["id"] if stage_row else None
    # Upsert customer
    customer = None
    if r.get("lead_email"):
        customer = db.query(Customer).filter(Customer.email == r["lead_email"]).first()
    if not customer:
        parts = (r.get("lead_name") or "Lead Marketing").split(" ", 1)
        customer = Customer(
            first_name=parts[0], last_name=parts[1] if len(parts) > 1 else "MKT",
            email=r.get("lead_email"), phone=r.get("lead_phone"),
        )
        db.add(customer); db.flush()
    # Create CRM lead (SaleOrder in pipeline)
    campaign_row = db.execute(text("SELECT nombre, numero FROM campaigns WHERE id=:id"), {"id": r.get("campaign_id")}).mappings().first()
    camp_name = campaign_row["nombre"] if campaign_row else "Marketing"
    lead_order = SaleOrder(
        customer_id=customer.id,
        stage_id=stage_id,
        lead_source=r.get("source_channel","MARKETING"),
        lead_description=f"Lead desde campaña: {camp_name}",
        lead_value=float(r.get("venta_atribuida_cop") or 0),
        canal_venta="CRM",
    )
    db.add(lead_order); db.flush()
    # Update campaign_lead with crm_lead_id
    db.execute(text("UPDATE campaign_leads SET crm_lead_id=:lid, estado='CONTACTADO' WHERE id=:id"), {"lid": lead_order.id, "id": lead_id})
    db.commit()
    return {"status": "success", "data": {"crm_lead_id": lead_order.id, "customer_id": customer.id, "message": "Lead sincronizado al pipeline CRM"}}

# ─── FLUJOS DE AUTOMATIZACIÓN ────────────────────────────────────────────────
@router.get("/flujos")
def list_flujos(db: Session = Depends(get_db), canal: Optional[str] = None):
    _ensure_marketing_tables(db)
    q = "SELECT * FROM automation_flows WHERE 1=1"
    params: dict = {}
    if canal:
        q += " AND canal=:canal"; params["canal"] = canal
    q += " ORDER BY created_at DESC"
    rows = db.execute(text(q), params).mappings().all()
    data = []
    for r in rows:
        d = dict(r); d["acciones"] = d.get("acciones") or []
        data.append(d)
    return {"status": "success", "data": data}

@router.post("/flujos")
def create_flujo(body: dict, db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    acciones = body.get("acciones", [])
    row = db.execute(text("""
        INSERT INTO automation_flows (nombre, canal, trigger_keyword, estado, acciones, descripcion)
        VALUES (:nombre, :canal, :kw, :estado, :acc::jsonb, :desc)
        RETURNING *
    """), {
        "nombre": body.get("nombre","Nuevo Flujo"), "canal": body.get("canal","INSTAGRAM"),
        "kw": body.get("trigger_keyword","INFO"), "estado": body.get("estado","INACTIVO"),
        "acc": json_mod.dumps(acciones), "desc": body.get("descripcion",""),
    }).mappings().first()
    db.commit()
    return {"status": "success", "data": dict(row)}

@router.patch("/flujos/{flujo_id}")
def update_flujo(flujo_id: int, body: dict, db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    allowed = ["nombre","canal","trigger_keyword","estado","acciones","descripcion"]
    sets = []; params: dict = {"id": flujo_id}
    for k, v in body.items():
        if k in allowed:
            if k == "acciones":
                sets.append(f"{k}=:{k}::jsonb"); params[k] = json_mod.dumps(v)
            else:
                sets.append(f"{k}=:{k}"); params[k] = v
    if sets:
        sets.append("updated_at=now()")
        db.execute(text(f"UPDATE automation_flows SET {','.join(sets)} WHERE id=:id"), params)
        db.commit()
    row = db.execute(text("SELECT * FROM automation_flows WHERE id=:id"), {"id": flujo_id}).mappings().first()
    d = dict(row); d["acciones"] = d.get("acciones") or []
    return {"status": "success", "data": d}

@router.delete("/flujos/{flujo_id}")
def delete_flujo(flujo_id: int, db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    db.execute(text("DELETE FROM automation_flows WHERE id=:id"), {"id": flujo_id})
    db.commit()
    return {"status": "success", "data": {"deleted": flujo_id}}

# ─── POSTS / HISTORIAS ────────────────────────────────────────────────────────
@router.get("/posts")
def list_posts(db: Session = Depends(get_db), tipo: Optional[str] = None, estado: Optional[str] = None, limit: int = 100):
    _ensure_marketing_tables(db)
    q = "SELECT * FROM social_posts WHERE 1=1"
    params: dict = {"limit": limit}
    if tipo:   q += " AND tipo=:tipo";   params["tipo"] = tipo
    if estado: q += " AND estado=:estado"; params["estado"] = estado
    q += " ORDER BY created_at DESC LIMIT :limit"
    rows = db.execute(text(q), params).mappings().all()
    data = []
    for r in rows:
        d = dict(r); d["canales"] = d.get("canales") or []
        data.append(d)
    return {"status": "success", "data": data}

@router.post("/posts")
def create_post(body: dict, db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    canales = body.get("canales", [])
    row = db.execute(text("""
        INSERT INTO social_posts (tipo, producto_id, producto_nombre, precio_cop, descuento_pct, canales, caption, imagen_url, formato, programado_para, estado, campaign_id)
        VALUES (:tipo, :pid, :pnom, :precio, :dpct, :canales::jsonb, :caption, :img, :fmt, :prog, :estado, :cid)
        RETURNING *
    """), {
        "tipo": body.get("tipo","HISTORIA"), "pid": body.get("producto_id"),
        "pnom": body.get("producto_nombre",""), "precio": body.get("precio_cop", 0),
        "dpct": body.get("descuento_pct", 0), "canales": json_mod.dumps(canales),
        "caption": body.get("caption",""), "img": body.get("imagen_url",""),
        "fmt": body.get("formato","minimalista"), "prog": body.get("programado_para"),
        "estado": body.get("estado","BORRADOR"), "cid": body.get("campaign_id"),
    }).mappings().first()
    db.commit()
    d = dict(row); d["canales"] = d.get("canales") or []
    # Auto-register in story_catalog if publicado
    if d.get("estado") == "PUBLICADO":
        db.execute(text("""
            INSERT INTO story_catalog (post_id, producto_nombre, precio_cop, imagen_url, canal, activo)
            VALUES (:pid, :pnom, :precio, :img, :canal, TRUE)
        """), {"pid": d["id"], "pnom": d.get("producto_nombre",""), "precio": d.get("precio_cop",0), "img": d.get("imagen_url",""), "canal": (canales[0] if canales else "INSTAGRAM")})
        db.commit()
    return {"status": "success", "data": d}

@router.patch("/posts/{post_id}")
def update_post(post_id: int, body: dict, db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    allowed = ["tipo","producto_nombre","precio_cop","descuento_pct","canales","caption","imagen_url","formato","programado_para","estado","interacciones","leads_generados"]
    sets = []; params: dict = {"id": post_id}
    for k, v in body.items():
        if k in allowed:
            if k == "canales":
                sets.append(f"{k}=:{k}::jsonb"); params[k] = json_mod.dumps(v)
            else:
                sets.append(f"{k}=:{k}"); params[k] = v
    if sets:
        db.execute(text(f"UPDATE social_posts SET {','.join(sets)} WHERE id=:id"), params)
        db.commit()
    row = db.execute(text("SELECT * FROM social_posts WHERE id=:id"), {"id": post_id}).mappings().first()
    d = dict(row); d["canales"] = d.get("canales") or []
    return {"status": "success", "data": d}

@router.delete("/posts/{post_id}")
def delete_post(post_id: int, db: Session = Depends(get_db)):
    _ensure_marketing_tables(db)
    db.execute(text("DELETE FROM social_posts WHERE id=:id"), {"id": post_id})
    db.commit()
    return {"status": "success", "data": {"deleted": post_id}}

# ─── STORY CATALOG (para Asistente Omnicanal) ─────────────────────────────────
@router.get("/story-catalog")
def get_story_catalog(db: Session = Depends(get_db), activo: bool = True):
    _ensure_marketing_tables(db)
    rows = db.execute(text("""
        SELECT sc.*, sp.caption, sp.formato, sp.tipo, sp.canales
        FROM story_catalog sc
        LEFT JOIN social_posts sp ON sc.post_id = sp.id
        WHERE sc.activo=:activo
        ORDER BY sc.publicado_en DESC LIMIT 50
    """), {"activo": activo}).mappings().all()
    data = []
    for r in rows:
        d = dict(r); d["canales"] = d.get("canales") or []
        data.append(d)
    return {"status": "success", "data": data}

@router.post("/story-catalog/ask")
def ask_story_product(body: dict, db: Session = Depends(get_db)):
    """El asistente omnicanal pregunta sobre un producto de una historia"""
    _ensure_marketing_tables(db)
    story_id = body.get("story_id")
    pregunta = body.get("pregunta","")
    row = db.execute(text("SELECT * FROM story_catalog WHERE id=:id"), {"id": story_id}).mappings().first()
    if not row:
        return {"status": "error", "message": "Historia no encontrada"}
    d = dict(row)
    precio_formateado = f"${float(d.get('precio_cop',0)):,.0f} COP"
    response = {
        "producto": d.get("producto_nombre"),
        "precio": precio_formateado,
        "imagen_url": d.get("imagen_url"),
        "canal": d.get("canal"),
        "respuesta_sugerida": f"¡Hola! 👋 El producto **{d.get('producto_nombre')}** tiene un precio de **{precio_formateado}**. ¿Te gustaría más información, o prefieres que te lo cotizamos directamente?",
        "acciones_disponibles": ["crear_lead", "crear_cotizacion", "ver_producto"]
    }
    return {"status": "success", "data": response}
