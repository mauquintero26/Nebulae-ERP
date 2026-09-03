"""
E-commerce API
Endpoints for: E-commerce stats, PWEB orders, digital catalog,
abandoned carts, web builder config, image management
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from typing import Optional
from app.db.database import get_db
from app.models.erp_documents import SaleOrder, ActivityLog
from app.models.customers import Customer
import datetime
import uuid
import json as json_mod

router = APIRouter()

def _now():
    return datetime.datetime.utcnow()

def _next_seq_pweb(db: Session) -> int:
    try:
        r = db.execute(text("SELECT nextval('seq_pweb')")).scalar()
        return r
    except Exception:
        db.execute(text("CREATE SEQUENCE IF NOT EXISTS seq_pweb START 1"))
        db.commit()
        r = db.execute(text("SELECT nextval('seq_pweb')")).scalar()
        return r

def _gen_pweb_numero(db: Session) -> str:
    year = datetime.datetime.utcnow().year
    n = _next_seq_pweb(db)
    return f"PWEB-{year}{n:04d}"

def _ensure_ecommerce_tables(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS web_carts (
            id SERIAL PRIMARY KEY,
            session_id VARCHAR(100),
            customer_email VARCHAR(200),
            customer_name VARCHAR(200),
            productos JSONB DEFAULT '[]',
            total_cop NUMERIC(14,2) DEFAULT 0,
            estado VARCHAR(30) DEFAULT 'ACTIVO',
            ip_address VARCHAR(50),
            recuperacion_enviada BOOLEAN DEFAULT FALSE,
            recuperacion_descuento NUMERIC(5,2) DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS web_builder_config (
            id SERIAL PRIMARY KEY,
            config_key VARCHAR(100) UNIQUE NOT NULL,
            config_value JSONB,
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS media_repository (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(300) NOT NULL,
            url VARCHAR(500) NOT NULL,
            tipo VARCHAR(50) DEFAULT 'imagen',
            tags JSONB DEFAULT '[]',
            size_bytes INTEGER DEFAULT 0,
            uploaded_by VARCHAR(150),
            created_at TIMESTAMP DEFAULT NOW()
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS ecommerce_products (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(500) NOT NULL,
            descripcion TEXT,
            descripcion_larga TEXT,
            sku VARCHAR(100),
            precio_venta NUMERIC(14,2) DEFAULT 0,
            precio_comparacion NUMERIC(14,2) DEFAULT 0,
            descuento_pct NUMERIC(5,2) DEFAULT 0,
            impuesto_pct NUMERIC(5,2) DEFAULT 0,
            categoria VARCHAR(200),
            sub_categoria VARCHAR(200),
            marca VARCHAR(200),
            tipo_producto VARCHAR(50) DEFAULT 'Bienes',
            imagenes JSONB DEFAULT '[]',
            atributos JSONB DEFAULT '[]',
            variantes JSONB DEFAULT '[]',
            stock_disponible INTEGER DEFAULT 0,
            alerta_stock_minimo INTEGER DEFAULT 5,
            publicado_web BOOLEAN DEFAULT FALSE,
            rastrear_inventario BOOLEAN DEFAULT TRUE,
            codigo_aduana VARCHAR(100),
            peso_kg NUMERIC(8,2),
            notas_internas TEXT,
            seo_titulo VARCHAR(300),
            seo_descripcion TEXT,
            seo_keywords TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            created_by VARCHAR(150)
        )
    """))
    db.commit()

# --- ECOMMERCE STATS ---
@router.get("/stats")
def get_ecommerce_stats(db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    today = datetime.date.today()
    start_today = datetime.datetime.combine(today, datetime.time.min)
    start_month = datetime.datetime.combine(today.replace(day=1), datetime.time.min)

    web_orders_today = db.query(SaleOrder).filter(SaleOrder.canal_venta == 'WEB', SaleOrder.created_at >= start_today).count()
    web_orders_month = db.query(SaleOrder).filter(SaleOrder.canal_venta == 'WEB', SaleOrder.created_at >= start_month).count()
    rev_today = float(db.query(func.sum(SaleOrder.total_cop)).filter(SaleOrder.canal_venta == 'WEB', SaleOrder.created_at >= start_today, SaleOrder.estado != 'CANCELADO').scalar() or 0)
    rev_month = float(db.query(func.sum(SaleOrder.total_cop)).filter(SaleOrder.canal_venta == 'WEB', SaleOrder.created_at >= start_month, SaleOrder.estado != 'CANCELADO').scalar() or 0)

    try:
        cr = db.execute(text("SELECT COUNT(*), COALESCE(SUM(total_cop),0) FROM web_carts WHERE estado='ABANDONADO'")).fetchone()
        carritos_count, carritos_valor = int(cr[0] or 0), float(cr[1] or 0)
    except Exception:
        carritos_count, carritos_valor = 0, 0

    try:
        prod_pub = int(db.execute(text("SELECT COUNT(*) FROM ecommerce_products WHERE publicado_web=TRUE")).scalar() or 0)
    except Exception:
        prod_pub = 0

    total_carts = carritos_count + web_orders_today
    conversion = round((web_orders_today / total_carts * 100), 1) if total_carts > 0 else 0.0

    recent = db.query(SaleOrder).filter(SaleOrder.canal_venta == 'WEB').order_by(SaleOrder.created_at.desc()).limit(10).all()
    orders_data = [{"id": o.id, "numero": o.pweb_numero or o.numero, "customer_name": o.customer_name or "Cliente Web", "customer_email": o.customer_email or "", "total_cop": float(o.total_cop or 0), "estado": o.estado, "created_at": o.created_at.isoformat() if o.created_at else None, "productos_count": len(o.productos or [])} for o in recent]

    return {"status": "success", "data": {"web_orders_today": web_orders_today, "web_orders_month": web_orders_month, "revenue_today": rev_today, "revenue_month": rev_month, "carritos_abandonados_count": carritos_count, "carritos_abandonados_valor": carritos_valor, "productos_publicados": prod_pub, "conversion_pct": conversion, "recent_orders": orders_data}}


# --- WEB ORDERS ---
@router.get("/pedidos")
def list_web_orders(estado: Optional[str] = None, search: Optional[str] = None, limit: int = Query(50, le=200), offset: int = 0, db: Session = Depends(get_db)):
    q = db.query(SaleOrder).filter(SaleOrder.canal_venta == 'WEB')
    if estado: q = q.filter(SaleOrder.estado == estado)
    if search:
        like = f"%{search}%"
        q = q.filter(SaleOrder.pweb_numero.ilike(like) | SaleOrder.customer_name.ilike(like) | SaleOrder.customer_email.ilike(like))
    total = q.count()
    items = q.order_by(SaleOrder.created_at.desc()).offset(offset).limit(limit).all()
    data = [{"id": o.id, "numero": o.pweb_numero or o.numero, "pven_numero": o.numero, "customer_name": o.customer_name or "Cliente Web", "customer_email": o.customer_email or "", "customer_phone": o.customer_phone or "", "total_cop": float(o.total_cop or 0), "estado": o.estado, "canal_venta": o.canal_venta, "productos": o.productos or [], "created_at": o.created_at.isoformat() if o.created_at else None} for o in items]
    return {"status": "success", "total": total, "data": data}


@router.post("/pedidos", status_code=201)
def create_web_order(body: dict, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    pweb_numero = _gen_pweb_numero(db)
    try:
        n = db.execute(text("SELECT nextval('seq_ven')")).scalar()
    except Exception:
        db.execute(text("CREATE SEQUENCE IF NOT EXISTS seq_ven START 1000"))
        db.commit()
        n = db.execute(text("SELECT nextval('seq_ven')")).scalar()
    year = datetime.datetime.utcnow().year
    pven_numero = f"PVEN-{year}{n:04d}"

    customer = None
    if body.get("customer_email"):
        customer = db.query(Customer).filter(Customer.email == body["customer_email"]).first()
    if not customer and body.get("customer_email"):
        names = (body.get("customer_name", "Web") or "Web").split(" ", 1)
        customer = Customer(first_name=names[0], last_name=names[1] if len(names) > 1 else "", email=body.get("customer_email"), phone=body.get("customer_phone", ""))
        db.add(customer)
        db.commit()
        db.refresh(customer)

    order = SaleOrder(numero=pven_numero, pweb_numero=pweb_numero, canal_venta="WEB", canal_metadata=body.get("canal_metadata"), customer_id=customer.id if customer else None, customer_name=body.get("customer_name", "Cliente Web"), customer_email=body.get("customer_email"), customer_phone=body.get("customer_phone"), customer_address=body.get("customer_address"), direccion_entrega=body.get("direccion_entrega") or body.get("customer_address"), total_cop=body.get("total_cop", 0), subtotal_cop=body.get("subtotal_cop", 0), descuento_pct=body.get("descuento_pct", 0), productos=body.get("productos", []), notas=body.get("notas"), estado="PENDIENTE_DESPACHO", created_by="WEB")
    db.add(order)
    db.commit()
    db.refresh(order)

    log = ActivityLog(entity_type="VEN", entity_id=order.id, entity_numero=pweb_numero, action="CREATED", description=f"Pedido web {pweb_numero} creado desde e-commerce", new_estado="PENDIENTE_DESPACHO", user_name="WEB")
    db.add(log)
    db.commit()
    return {"status": "success", "data": {"id": order.id, "numero": pven_numero, "pweb_numero": pweb_numero, "estado": order.estado}}


# --- CARRITOS ---
@router.get("/carritos")
def list_carritos(estado: str = "ABANDONADO", db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    try:
        rows = db.execute(text("SELECT id, session_id, customer_email, customer_name, productos, total_cop, estado, recuperacion_enviada, recuperacion_descuento, created_at FROM web_carts WHERE estado=:e ORDER BY created_at DESC LIMIT 50"), {"e": estado}).fetchall()
        return {"status": "success", "data": [{"id": r[0], "session_id": r[1], "customer_email": r[2], "customer_name": r[3], "productos": r[4] or [], "total_cop": float(r[5] or 0), "estado": r[6], "recuperacion_enviada": r[7], "recuperacion_descuento": float(r[8] or 0), "created_at": r[9].isoformat() if r[9] else None} for r in rows]}
    except Exception:
        return {"status": "success", "data": []}

@router.post("/carritos")
def save_cart(body: dict, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    session_id = body.get("session_id", str(uuid.uuid4()))
    existing = db.execute(text("SELECT id FROM web_carts WHERE session_id=:s"), {"s": session_id}).fetchone()
    pj = json_mod.dumps(body.get("productos", []))
    if existing:
        db.execute(text("UPDATE web_carts SET customer_email=:e, customer_name=:n, productos=:p::jsonb, total_cop=:t, estado=:s, updated_at=NOW() WHERE session_id=:sid"), {"e": body.get("customer_email"), "n": body.get("customer_name"), "p": pj, "t": body.get("total_cop", 0), "s": body.get("estado", "ACTIVO"), "sid": session_id})
    else:
        db.execute(text("INSERT INTO web_carts (session_id, customer_email, customer_name, productos, total_cop, estado, ip_address) VALUES (:sid, :e, :n, :p::jsonb, :t, :s, :ip)"), {"sid": session_id, "e": body.get("customer_email"), "n": body.get("customer_name"), "p": pj, "t": body.get("total_cop", 0), "s": body.get("estado", "ACTIVO"), "ip": body.get("ip_address")})
    db.commit()
    return {"status": "success", "session_id": session_id}

@router.patch("/carritos/{cart_id}/recuperar")
def recuperar_carrito(cart_id: int, body: dict, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    descuento = body.get("descuento_pct", 10)
    db.execute(text("UPDATE web_carts SET recuperacion_enviada=TRUE, recuperacion_descuento=:d, updated_at=NOW() WHERE id=:id"), {"d": descuento, "id": cart_id})
    db.commit()
    return {"status": "success", "message": f"Recuperacion enviada con {descuento}% descuento"}


# --- CATALOGO DIGITAL ---
@router.get("/catalogo")
def list_catalogo(search: Optional[str] = None, categoria: Optional[str] = None, publicado: Optional[bool] = None, limit: int = Query(100, le=500), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    where_clauses = []
    params: dict = {"limit": limit}
    if search:
        where_clauses.append("(nombre ILIKE :s OR sku ILIKE :s OR descripcion ILIKE :s)")
        params["s"] = f"%{search}%"
    if categoria:
        where_clauses.append("categoria ILIKE :c")
        params["c"] = f"%{categoria}%"
    if publicado is not None:
        where_clauses.append("publicado_web = :pub")
        params["pub"] = publicado
    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    try:
        rows = db.execute(text(f"SELECT id, nombre, descripcion, sku, precio_venta, precio_comparacion, descuento_pct, impuesto_pct, categoria, sub_categoria, marca, tipo_producto, imagenes, atributos, variantes, stock_disponible, alerta_stock_minimo, publicado_web, rastrear_inventario, seo_titulo, created_at, updated_at FROM ecommerce_products {where_sql} ORDER BY nombre LIMIT :limit"), params).fetchall()
        total = int(db.execute(text(f"SELECT COUNT(*) FROM ecommerce_products {where_sql}"), {k:v for k,v in params.items() if k!="limit"}).scalar() or 0)
        data = [{"id": r[0], "nombre": r[1], "descripcion": r[2], "sku": r[3], "precio_venta": float(r[4] or 0), "precio_comparacion": float(r[5] or 0), "descuento_pct": float(r[6] or 0), "impuesto_pct": float(r[7] or 0), "categoria": r[8], "sub_categoria": r[9], "marca": r[10], "tipo_producto": r[11], "imagenes": r[12] or [], "atributos": r[13] or [], "variantes": r[14] or [], "stock_disponible": r[15] or 0, "alerta_stock_minimo": r[16] or 5, "publicado_web": r[17], "rastrear_inventario": r[18], "seo_titulo": r[19], "created_at": r[20].isoformat() if r[20] else None, "updated_at": r[21].isoformat() if r[21] else None, "is_low_stock": (r[15] or 0) <= (r[16] or 5)} for r in rows]
        return {"status": "success", "total": total, "data": data}
    except Exception as e:
        return {"status": "success", "total": 0, "data": [], "error": str(e)}

@router.get("/catalogo/{product_id}")
def get_catalogo_product(product_id: int, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    row = db.execute(text("SELECT * FROM ecommerce_products WHERE id=:id"), {"id": product_id}).fetchone()
    if not row:
        raise HTTPException(404, "Producto no encontrado")
    keys = ["id","nombre","descripcion","descripcion_larga","sku","precio_venta","precio_comparacion","descuento_pct","impuesto_pct","categoria","sub_categoria","marca","tipo_producto","imagenes","atributos","variantes","stock_disponible","alerta_stock_minimo","publicado_web","rastrear_inventario","codigo_aduana","peso_kg","notas_internas","seo_titulo","seo_descripcion","seo_keywords","created_at","updated_at","created_by"]
    data = dict(zip(keys, row))
    # Sales analytics for this product
    ventas_prod = db.query(SaleOrder).filter(SaleOrder.canal_venta=='WEB', SaleOrder.estado!='CANCELADO').all()
    total_vendido = sum(p.get("qty", p.get("cantidad", 0)) for o in ventas_prod for p in (o.productos or []) if p.get("sku") == data.get("sku") or p.get("nombre","").lower() == (data.get("nombre") or "").lower())
    data["total_vendido"] = total_vendido
    for k in ["created_at","updated_at"]:
        if data.get(k) and hasattr(data[k],"isoformat"):
            data[k] = data[k].isoformat()
    return {"status": "success", "data": data}

@router.post("/catalogo", status_code=201)
def create_catalogo_product(body: dict, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    now = datetime.datetime.utcnow()
    result = db.execute(text("""
        INSERT INTO ecommerce_products (nombre,descripcion,descripcion_larga,sku,precio_venta,precio_comparacion,descuento_pct,impuesto_pct,categoria,sub_categoria,marca,tipo_producto,imagenes,atributos,variantes,stock_disponible,alerta_stock_minimo,publicado_web,rastrear_inventario,codigo_aduana,peso_kg,notas_internas,seo_titulo,seo_descripcion,seo_keywords,created_at,updated_at,created_by)
        VALUES (:nombre,:descripcion,:descripcion_larga,:sku,:precio_venta,:precio_comparacion,:descuento_pct,:impuesto_pct,:categoria,:sub_categoria,:marca,:tipo_producto,:imagenes::jsonb,:atributos::jsonb,:variantes::jsonb,:stock_disponible,:alerta_stock_minimo,:publicado_web,:rastrear_inventario,:codigo_aduana,:peso_kg,:notas_internas,:seo_titulo,:seo_descripcion,:seo_keywords,:now,:now,:created_by)
        RETURNING id
    """), {"nombre": body.get("nombre",""), "descripcion": body.get("descripcion"), "descripcion_larga": body.get("descripcion_larga"), "sku": body.get("sku"), "precio_venta": body.get("precio_venta",0), "precio_comparacion": body.get("precio_comparacion",0), "descuento_pct": body.get("descuento_pct",0), "impuesto_pct": body.get("impuesto_pct",0), "categoria": body.get("categoria"), "sub_categoria": body.get("sub_categoria"), "marca": body.get("marca"), "tipo_producto": body.get("tipo_producto","Bienes"), "imagenes": json_mod.dumps(body.get("imagenes",[])), "atributos": json_mod.dumps(body.get("atributos",[])), "variantes": json_mod.dumps(body.get("variantes",[])), "stock_disponible": body.get("stock_disponible",0), "alerta_stock_minimo": body.get("alerta_stock_minimo",5), "publicado_web": body.get("publicado_web",False), "rastrear_inventario": body.get("rastrear_inventario",True), "codigo_aduana": body.get("codigo_aduana"), "peso_kg": body.get("peso_kg"), "notas_internas": body.get("notas_internas"), "seo_titulo": body.get("seo_titulo"), "seo_descripcion": body.get("seo_descripcion"), "seo_keywords": body.get("seo_keywords"), "now": now, "created_by": body.get("created_by","")})
    db.commit()
    new_id = result.fetchone()[0]
    return {"status": "success", "data": {"id": new_id}}

@router.patch("/catalogo/{product_id}")
def update_catalogo_product(product_id: int, body: dict, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    allowed = ["nombre","descripcion","descripcion_larga","sku","precio_venta","precio_comparacion","descuento_pct","impuesto_pct","categoria","sub_categoria","marca","tipo_producto","stock_disponible","alerta_stock_minimo","publicado_web","rastrear_inventario","codigo_aduana","peso_kg","notas_internas","seo_titulo","seo_descripcion","seo_keywords"]
    json_fields = ["imagenes","atributos","variantes"]
    sets = []
    params: dict = {"id": product_id, "now": datetime.datetime.utcnow()}
    for k in allowed:
        if k in body:
            sets.append(f"{k}=:{k}")
            params[k] = body[k]
    for k in json_fields:
        if k in body:
            sets.append(f"{k}=:{k}::jsonb")
            params[k] = json_mod.dumps(body[k])
    if not sets:
        raise HTTPException(400, "Nada que actualizar")
    sets.append("updated_at=:now")
    db.execute(text(f"UPDATE ecommerce_products SET {', '.join(sets)} WHERE id=:id"), params)
    db.commit()
    return {"status": "success"}

@router.delete("/catalogo/{product_id}")
def delete_catalogo_product(product_id: int, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    db.execute(text("DELETE FROM ecommerce_products WHERE id=:id"), {"id": product_id})
    db.commit()
    return {"status": "success"}

@router.get("/categorias")
def get_categorias_web(db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    try:
        rows = db.execute(text("SELECT DISTINCT categoria, sub_categoria FROM ecommerce_products WHERE publicado_web=TRUE AND categoria IS NOT NULL ORDER BY categoria, sub_categoria")).fetchall()
        cat_map: dict = {}
        for r in rows:
            cat = r[0] or "General"
            sub = r[1]
            if cat not in cat_map:
                cat_map[cat] = {"nombre": cat, "sub_categorias": []}
            if sub and sub not in cat_map[cat]["sub_categorias"]:
                cat_map[cat]["sub_categorias"].append(sub)
        return {"status": "success", "data": list(cat_map.values())}
    except Exception:
        return {"status": "success", "data": []}


# --- MEDIA REPOSITORY ---
@router.get("/media")
def list_media(db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    try:
        rows = db.execute(text("SELECT id, filename, url, tipo, tags, size_bytes, uploaded_by, created_at FROM media_repository ORDER BY created_at DESC LIMIT 200")).fetchall()
        return {"status": "success", "data": [{"id": r[0], "filename": r[1], "url": r[2], "tipo": r[3], "tags": r[4] or [], "size_bytes": r[5] or 0, "uploaded_by": r[6], "created_at": r[7].isoformat() if r[7] else None} for r in rows]}
    except Exception:
        return {"status": "success", "data": []}

@router.post("/media", status_code=201)
def upload_media(body: dict, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    result = db.execute(text("INSERT INTO media_repository (filename, url, tipo, tags, size_bytes, uploaded_by) VALUES (:fn, :url, :tipo, :tags::jsonb, :size, :user) RETURNING id"), {"fn": body.get("filename","imagen"), "url": body.get("url",""), "tipo": body.get("tipo","imagen"), "tags": json_mod.dumps(body.get("tags",[])), "size": body.get("size_bytes",0), "user": body.get("uploaded_by","")})
    db.commit()
    return {"status": "success", "data": {"id": result.fetchone()[0]}}

@router.delete("/media/{media_id}")
def delete_media(media_id: int, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    db.execute(text("DELETE FROM media_repository WHERE id=:id"), {"id": media_id})
    db.commit()
    return {"status": "success"}


# --- WEB BUILDER ---
@router.get("/web-builder/config")
def get_web_config(db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    try:
        rows = db.execute(text("SELECT config_key, config_value FROM web_builder_config")).fetchall()
        return {"status": "success", "data": {r[0]: r[1] for r in rows}}
    except Exception:
        return {"status": "success", "data": {}}

@router.patch("/web-builder/config")
def update_web_config(body: dict, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    for key, value in body.items():
        val_json = json_mod.dumps(value) if not isinstance(value, str) else json_mod.dumps(value)
        db.execute(text("INSERT INTO web_builder_config (config_key, config_value, updated_at) VALUES (:k, :v::jsonb, NOW()) ON CONFLICT (config_key) DO UPDATE SET config_value=:v::jsonb, updated_at=NOW()"), {"k": key, "v": val_json})
    db.commit()
    return {"status": "success"}

@router.post("/web-builder/chat")
def web_builder_chat(body: dict, db: Session = Depends(get_db)):
    instruction = (body.get("instruction", "") or "").lower()
    changes: dict = {}
    suggestions: list = []
    if any(w in instruction for w in ["color","fondo","background","paleta","tema"]):
        changes["theme"] = {"primary": body.get("primary_color","#6C3EC0"), "secondary": "#f8f9fa", "accent": "#9F7AEA"}
        suggestions.append("Paleta de colores actualizada")
    if any(w in instruction for w in ["hero","banner","inicio","cabecera"]):
        changes["hero"] = {"title": body.get("title","Bienvenido a Nebulae"), "subtitle": body.get("subtitle","Productos de calidad para ti"), "cta_text": body.get("cta_text","Comprar Ahora"), "cta_url": "/store/catalogo", "bg_image": body.get("bg_image","")}
        suggestions.append("Sección hero/banner configurada")
    if any(w in instruction for w in ["producto","categor","destacado","seccion"]):
        changes["featured_section"] = {"enabled": True, "title": body.get("section_title","Productos Destacados"), "categoria": body.get("categoria",""), "limit": body.get("limit",8), "layout": body.get("layout","grid")}
        suggestions.append("Sección de productos destacados configurada")
    if any(w in instruction for w in ["contacto","whatsapp","telefono","email","direccion"]):
        changes["contact"] = {"phone": body.get("phone",""), "whatsapp": body.get("whatsapp",""), "email": body.get("email",""), "address": body.get("address","")}
        suggestions.append("Información de contacto actualizada")
    if any(w in instruction for w in ["blog","articulo","post","contenido"]):
        changes["blog"] = {"enabled": True, "title": body.get("blog_title","Blog Nebulae"), "posts_home": body.get("posts_home", 3)}
        suggestions.append("Sección de blog habilitada")

    response_text = "He procesado tu instrucción. " + ". ".join(suggestions) if suggestions else (
        "Entendido. Puedo configurar: 🎨 colores/tema, 🖼️ sección hero/banner, 📦 productos destacados por categoría, 📞 información de contacto, 📝 blog. ¿Qué quieres cambiar?"
    )
    # Apply changes if any
    if changes:
        for key, value in changes.items():
            db.execute(text("INSERT INTO web_builder_config (config_key, config_value, updated_at) VALUES (:k, :v::jsonb, NOW()) ON CONFLICT (config_key) DO UPDATE SET config_value=:v::jsonb, updated_at=NOW()"), {"k": key, "v": json_mod.dumps(value)})
        db.commit()
    return {"status": "success", "data": {"response": response_text, "changes": changes, "applied": len(changes) > 0}}


# --- PAGOS CONFIG ---
@router.get("/pagos/config")
def get_payment_config(db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    try:
        row = db.execute(text("SELECT config_value FROM web_builder_config WHERE config_key='payment_gateways'")).fetchone()
        if row and row[0]:
            config = dict(row[0])
            for gw, sk_field in [("stripe","secret_key"),("mercadopago","access_token")]:
                if gw in config:
                    sk = config[gw].get(sk_field,"")
                    config[gw][f"{sk_field}_masked"] = ("*"*max(0,len(sk)-4)+sk[-4:]) if sk else ""
                    config[gw].pop(sk_field, None)
            return {"status": "success", "data": config}
    except Exception:
        pass
    return {"status": "success", "data": {"stripe": {"enabled": False, "publishable_key": "", "webhook_secret": ""}, "mercadopago": {"enabled": False, "public_key": ""}}}

@router.patch("/pagos/config")
def update_payment_config(body: dict, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    existing = db.execute(text("SELECT config_value FROM web_builder_config WHERE config_key='payment_gateways'")).fetchone()
    existing_data: dict = dict(existing[0]) if existing and existing[0] else {}
    for gateway, config in body.items():
        if gateway in ["stripe","mercadopago"]:
            if gateway not in existing_data:
                existing_data[gateway] = {}
            existing_data[gateway].update(config)
    db.execute(text("INSERT INTO web_builder_config (config_key, config_value, updated_at) VALUES ('payment_gateways', :v::jsonb, NOW()) ON CONFLICT (config_key) DO UPDATE SET config_value=:v::jsonb, updated_at=NOW()"), {"v": json_mod.dumps(existing_data)})
    db.commit()
    return {"status": "success"}

@router.get("/envios/config")
def get_shipping_config(db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    try:
        row = db.execute(text("SELECT config_value FROM web_builder_config WHERE config_key='shipping'")).fetchone()
        if row and row[0]:
            return {"status": "success", "data": row[0]}
    except Exception:
        pass
    return {"status": "success", "data": {"envio_local": {"enabled": True, "tarifa": 12000}, "envio_nacional": {"enabled": True, "tarifa": 25000}, "envio_gratis_desde": 200000, "zonas": []}}

@router.patch("/envios/config")
def update_shipping_config(body: dict, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    db.execute(text("INSERT INTO web_builder_config (config_key, config_value, updated_at) VALUES ('shipping', :v::jsonb, NOW()) ON CONFLICT (config_key) DO UPDATE SET config_value=:v::jsonb, updated_at=NOW()"), {"v": json_mod.dumps(body)})
    db.commit()
    return {"status": "success"}


# --- CLIENTES WEB → AGENDA CRM ---
@router.get("/clientes")
def list_clientes_web(db: Session = Depends(get_db)):
    """Lista clientes únicos que han realizado pedidos web (canal_venta=WEB)"""
    web_orders = db.query(SaleOrder).filter(
        SaleOrder.canal_venta == 'WEB',
        SaleOrder.customer_email.isnot(None)
    ).all()
    # Deduplicate by email
    seen = set()
    clientes = []
    for o in web_orders:
        email = (o.customer_email or "").lower()
        if email and email not in seen:
            seen.add(email)
            # Check if already in CRM agenda
            from app.models.customers import Customer
            crm_customer = db.query(Customer).filter(Customer.email == email).first()
            clientes.append({
                "email": o.customer_email,
                "nombre": o.customer_name,
                "telefono": o.customer_phone,
                "address": o.customer_address,
                "primer_pedido": o.created_at.isoformat() if o.created_at else None,
                "total_pedidos": sum(1 for x in web_orders if (x.customer_email or "").lower() == email),
                "total_cop": sum(float(x.total_cop or 0) for x in web_orders if (x.customer_email or "").lower() == email),
                "en_agenda": crm_customer is not None,
                "crm_id": crm_customer.id if crm_customer else None,
            })
    return {"status": "success", "total": len(clientes), "data": clientes}


@router.post("/clientes/sync-agenda")
def sync_clientes_web_to_agenda(body: dict, db: Session = Depends(get_db)):
    """Importa clientes web a la agenda CRM marcados como canal=WEB"""
    from app.models.customers import Customer
    emails = body.get("emails", [])  # list of emails to sync, or empty = all
    web_orders = db.query(SaleOrder).filter(
        SaleOrder.canal_venta == 'WEB',
        SaleOrder.customer_email.isnot(None)
    ).all()
    seen: dict = {}
    for o in web_orders:
        email = (o.customer_email or "").lower()
        if email and email not in seen:
            seen[email] = o
    if emails:
        to_sync = {e.lower(): seen[e.lower()] for e in emails if e.lower() in seen}
    else:
        to_sync = seen
    imported = 0
    already_exists = 0
    for email, order in to_sync.items():
        existing = db.query(Customer).filter(Customer.email == email).first()
        if existing:
            already_exists += 1
            continue
        # Parse name parts
        full_name = (order.customer_name or "").strip()
        parts = full_name.split(" ", 1)
        first_name = parts[0] if parts else "Cliente"
        last_name = parts[1] if len(parts) > 1 else "Web"
        new_customer = Customer(
            first_name=first_name,
            last_name=last_name + " [WEB]",
            email=order.customer_email,
            phone=order.customer_phone,
            address=order.customer_address,
            city=None,
            document=None,
        )
        db.add(new_customer)
        imported += 1
    db.commit()
    return {"status": "success", "data": {"importados": imported, "ya_existian": already_exists, "total_procesados": len(to_sync)}}
