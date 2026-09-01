import os
import re

path = 'src/app/dashboard/agenda/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Make the Nueva Solicitud button functional
old_modal_solicitud = r"<button onClick=\{\(\) => \{ toast\.success\('Solicitud Creada! El cliente ha sido ingresado al pipeline del CRM en la etapa correspondiente\.'\); setShowModal\(null\); \}\} className=\"w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-purple-700 transition-colors mt-2 flex items-center justify-center gap-2\">\s*Ingresar al CRM <ArrowRight size=\{16\} />\s*</button>"
new_modal_solicitud = """<button onClick={async () => { 
                    try {
                      toast.loading('Creando solicitud...', { id: 'nueva-sol' });
                      const res = await fetch(`${API_URL}/sales/`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${localStorage.getItem('token')}`
                        },
                        body: JSON.stringify({
                          customer_id: clientData.realId,
                          sale_type: 'ON_DEMAND',
                          status: 'DRAFT',
                          lines: []
                        })
                      });
                      if(!res.ok) throw new Error('Error al crear');
                      toast.success('¡Solicitud Creada! Se ha ingresado al pipeline de Ventas.', { id: 'nueva-sol' }); 
                      setShowModal(null);
                      // Refrescar el perfil 360 si quieres, o solo cerrar el modal
                      if (clientData.realId) {
                        const prof = await fetch(`${API_URL}/crm/customers/${clientData.realId}/profile-360`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(r=>r.json());
                        setCustomer360(prof.data);
                      }
                    } catch (error) {
                      toast.error('Error al crear la solicitud', { id: 'nueva-sol' });
                    }
                  }} className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-md hover:bg-purple-700 transition-colors mt-2 flex items-center justify-center gap-2">
                      Ingresar al CRM <ArrowRight size={16} />
                    </button>"""

text = re.sub(old_modal_solicitud, new_modal_solicitud, text)
text = text.replace("Solicitud Creada! El cliente ha sido ingresado al pipeline del CRM en la etapa correspondiente.", "¡Solicitud Creada! Se ha ingresado al pipeline de Ventas.")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Updated Nueva Solicitud action")
