from fastapi import APIRouter
from app.api.dependencies import RoleChecker
from fastapi import Depends

router = APIRouter()

@router.get("/flows")
def get_marketing_flows():
    # Return ReactFlow compatible JSON for the canvas
    data = {
        "nodes": [
            {"id": "1", "type": "trigger", "position": {"x": 250, "y": 5}, "data": {"label": "Nuevo Lead (WhatsApp)"}},
            {"id": "2", "type": "action", "position": {"x": 250, "y": 100}, "data": {"label": "Enviar Mensaje Bienvenida"}},
            {"id": "3", "type": "condition", "position": {"x": 250, "y": 200}, "data": {"label": "¿Respondió en 24h?"}}
        ],
        "edges": [
            {"id": "e1-2", "source": "1", "target": "2", "animated": True},
            {"id": "e2-3", "source": "2", "target": "3", "animated": True}
        ]
    }
    return {"status": "success", "data": data}
