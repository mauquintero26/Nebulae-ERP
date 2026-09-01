import os
import re

path = 'src/app/dashboard/agenda/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Replace MOCK_CLIENTS with state
text = re.sub(r'const MOCK_CLIENTS = \[.*?\];', '', text, flags=re.DOTALL)

imports = "import { getCustomers, createCustomer } from '@/lib/api';\nimport toast from 'react-hot-toast';\n"
if "import { getCustomers" not in text:
    text = text.replace("import { useState", "import { useState, useEffect")
    text = text.replace("import { \n  Search", imports + "import { \n  Search")

# Add state and useEffect inside AgendaPage
state_injection = '''
  const [customers, setCustomers] = useState<any[]>([]);
  const [formData, setFormData] = useState<any>({});
  
  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const data = await getCustomers();
      const realCustomers = data.data || data;
      if (Array.isArray(realCustomers)) {
        const mapped = realCustomers.map(c => ({
          id: `CLI-00${c.id}`,
          realId: c.id,
          name: `${c.first_name} ${c.last_name}`,
          email: c.email || '',
          phone: c.phone || '',
          type: 'Regular',
          sector: 'N/A',
          source: 'Registro CRM',
          initial: c.first_name ? c.first_name.charAt(0).toUpperCase() : 'C',
          document: '',
          address: '',
          city: c.city || '',
          country: 'Colombia',
          category: 'Regular',
          tags: []
        }));
        setCustomers(mapped);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleSave = async () => {
    if (selectedClient === 'NEW') {
      try {
        toast.loading('Guardando cliente...', { id: 'save-client' });
        // Mapear nombre completo
        const names = (formData.name || 'Sin Nombre').split(' ');
        const first = names[0];
        const last = names.slice(1).join(' ') || '';
        
        await createCustomer({
          first_name: first,
          last_name: last,
          email: formData.email,
          phone: formData.phone,
          city: formData.city
        });
        
        toast.success('Cliente creado', { id: 'save-client' });
        setSelectedClient(null);
        fetchCustomers();
      } catch (error: any) {
        toast.error(error.message, { id: 'save-client' });
      }
    } else {
      toast.success('Cambios guardados localmente');
    }
  };
  
  const MOCK_CLIENTS = customers;
'''

text = text.replace("const [showModal, setShowModal] = useState<string | null>(null);", "const [showModal, setShowModal] = useState<string | null>(null);\n" + state_injection)

# Now, we need to bind the inputs and buttons!
# For defaultValues, we change them to value={formData...} onChange...
text = text.replace('defaultValue={clientData.name}', 'value={formData.name || clientData.name || ""} onChange={(e) => setFormData({...formData, name: e.target.value})}')
text = text.replace('defaultValue={clientData.email}', 'value={formData.email || clientData.email || ""} onChange={(e) => setFormData({...formData, email: e.target.value})}')
text = text.replace('defaultValue={clientData.phone}', 'value={formData.phone || clientData.phone || ""} onChange={(e) => setFormData({...formData, phone: e.target.value})}')
text = text.replace('defaultValue={clientData.city}', 'value={formData.city || clientData.city || ""} onChange={(e) => setFormData({...formData, city: e.target.value})}')
text = text.replace('defaultValue={clientData.address}', 'value={formData.address || clientData.address || ""} onChange={(e) => setFormData({...formData, address: e.target.value})}')
text = text.replace('defaultValue={clientData.document}', 'value={formData.document || clientData.document || ""} onChange={(e) => setFormData({...formData, document: e.target.value})}')

# The save button
save_button_old = '''onClick={() => {
                      alert(isNew ? 'Nuevo cliente creado' : 'Cambios guardados correctamente');
                      if(isNew) setSelectedClient(null);
                    }}'''
if save_button_old in text:
    text = text.replace(save_button_old, 'onClick={handleSave}')
else:
    # Let's try Regex
    text = re.sub(r'onClick=\{\(\) => \{\s*alert\(isNew \? [^}]+\}\}', 'onClick={handleSave}', text, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Injected state into Agenda")
