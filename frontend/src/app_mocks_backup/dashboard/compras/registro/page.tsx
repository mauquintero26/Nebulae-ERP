'use client';

import { useState } from 'react';
import { ShoppingBag, UploadCloud, Plus, Save, Trash2, Camera, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function ComprasRegistroPage() {
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [ocrSuccess, setOcrSuccess] = useState('');

  // Manual Form State
  const [orderNum, setOrderNum] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  
  const [products, setProducts] = useState([
    { id: 1, name: '', attributes: '', quantity: 1, price: 0 }
  ]);
  const [isManualLoading, setIsManualLoading] = useState(false);
  const [manualError, setManualError] = useState('');
  const [manualSuccess, setManualSuccess] = useState('');

  // OCR Upload Handler
  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setIsOcrLoading(true);
    setOcrError('');
    setOcrSuccess('');

    const formData = new FormData();
    for (let i = 0; i < e.target.files.length; i++) {
      formData.append('files', e.target.files[i]);
    }

    try {
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/compras/upload-image', {
        method: 'POST',
        headers: {
          'x-api-key': localStorage.getItem('ai_api_key') || ''
        },
        body: formData
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setOcrSuccess(`¡Se procesaron ${data.results?.length || 0} imágenes correctamente! Los datos se han guardado en el historial.`);
    } catch (err: any) {
      setOcrError(err.message || 'Ocurrió un error al procesar las imágenes.');
    } finally {
      setIsOcrLoading(false);
      // reset file input
      e.target.value = '';
    }
  };

  // Manual Form Handlers
  const addProduct = () => {
    setProducts([...products, { id: Date.now(), name: '', attributes: '', quantity: 1, price: 0 }]);
  };

  const removeProduct = (id: number) => {
    if (products.length === 1) return;
    setProducts(products.filter(p => p.id !== id));
  };

  const updateProduct = (id: number, field: string, value: any) => {
    setProducts(products.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleManualSave = async () => {
    if (!orderNum) {
      setManualError('El número de orden es obligatorio.');
      return;
    }

    const validProducts = products.filter(p => p.name.trim() !== '');
    if (validProducts.length === 0) {
      setManualError('Añade al menos un producto válido (con nombre).');
      return;
    }

    setIsManualLoading(true);
    setManualError('');
    setManualSuccess('');

    const payload = {
      order_number: orderNum,
      date: orderDate,
      status: orderStatus,
      products: validProducts.map(p => ({
        name: p.name,
        attributes: p.attributes,
        quantity: parseInt(String(p.quantity)) || 1,
        price: parseFloat(String(p.price)) || 0
      }))
    };

    try {
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/compras/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setManualSuccess(`✓ Compra ${orderNum} registrada exitosamente en el historial.`);
        // Reset form
        setOrderNum('');
        setOrderDate('');
        setOrderStatus('');
        setProducts([{ id: Date.now(), name: '', attributes: '', quantity: 1, price: 0 }]);
      } else {
        throw new Error('Error al guardar la compra en el servidor.');
      }
    } catch (err: any) {
      setManualError(err.message || 'Error de conexión.');
    } finally {
      setIsManualLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full pb-10">
      <div className="flex flex-col items-start justify-between">
        <Link href="/dashboard/compras" className="flex items-center text-sm font-semibold text-slate-500 hover:text-emerald-600 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Dashboard Compras
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Camera className="w-6 h-6 text-emerald-600" /> Registro de Compras
          </h1>
          <p className="text-sm text-slate-500 mt-1">Sube capturas de tus órdenes para extraer los datos con IA, o regístralas de forma manual.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* Left: OCR Upload */}
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col min-h-[400px]">
            <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-emerald-600" /> Subir Imagen (OCR Automático)
            </h3>
            <p className="text-xs text-slate-500 mb-6">Sube capturas o imágenes de las órdenes (ej. Orden Tommy) para extraer datos automáticamente usando IA.</p>

            <label className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-8 transition-colors text-center cursor-pointer ${isOcrLoading ? 'bg-slate-50 border-slate-200' : 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50'}`}>
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleOcrUpload} disabled={isOcrLoading} />
              
              {isOcrLoading ? (
                <>
                  <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
                  <p className="font-bold text-emerald-700 text-sm">Procesando imágenes...</p>
                  <p className="text-xs text-emerald-600/70 mt-2 max-w-xs">La IA está leyendo y catalogando los productos y precios. Esto puede tardar unos segundos.</p>
                </>
              ) : (
                <>
                  <UploadCloud className="w-12 h-12 text-emerald-400 mb-4" />
                  <p className="font-bold text-emerald-800 text-sm mb-1">Haz clic para subir imágenes</p>
                  <p className="text-xs text-emerald-600/70">Soporta PNG, JPG, JPEG.</p>
                </>
              )}
            </label>

            {ocrError && (
              <div className="mt-4 bg-red-50 text-red-700 border border-red-200 p-3 rounded-lg flex items-start gap-2 text-sm font-medium">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /> <div>{ocrError}</div>
              </div>
            )}
            
            {ocrSuccess && (
              <div className="mt-4 bg-emerald-50 text-emerald-800 border border-emerald-200 p-3 rounded-lg flex items-start gap-2 text-sm font-medium">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600" /> <div>{ocrSuccess}</div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Manual Entry */}
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-600" /> Registro Manual / Edición
            </h3>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Número de Orden *</label>
                <input type="text" value={orderNum} onChange={e => setOrderNum(e.target.value)} placeholder="Ej: #6103768802" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Fecha de Compra</label>
                <input type="text" value={orderDate} onChange={e => setOrderDate(e.target.value)} placeholder="Ej: 27/06/2026" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Estado</label>
                <input type="text" value={orderStatus} onChange={e => setOrderStatus(e.target.value)} placeholder="Ej: Procesada, en espera de confirmación" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500" />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h4 className="font-bold text-slate-700 mb-4 text-sm">Productos de la Orden</h4>
              
              <div className="flex flex-col gap-4 mb-4">
                {products.map((p, idx) => (
                  <div key={p.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg relative group">
                    {products.length > 1 && (
                      <button onClick={() => removeProduct(p.id)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-5">
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Nombre</label>
                        <input type="text" placeholder="Ej: Slim Fit Shirt" value={p.name} onChange={e => updateProduct(p.id, 'name', e.target.value)} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-md text-xs outline-none focus:border-emerald-500" />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Atributos</label>
                        <input type="text" placeholder="Ej: Blue / L" value={p.attributes} onChange={e => updateProduct(p.id, 'attributes', e.target.value)} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-md text-xs outline-none focus:border-emerald-500" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Cant.</label>
                        <input type="number" min="1" value={p.quantity} onChange={e => updateProduct(p.id, 'quantity', e.target.value)} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-md text-xs outline-none focus:border-emerald-500" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Precio</label>
                        <input type="number" min="0" step="0.01" value={p.price} onChange={e => updateProduct(p.id, 'price', e.target.value)} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-md text-xs outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={addProduct} className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors mb-6">
                <Plus className="w-4 h-4" /> Añadir Producto
              </button>

              {manualError && (
                <div className="mb-4 bg-red-50 text-red-700 border border-red-200 p-3 rounded-lg flex items-start gap-2 text-sm font-medium">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /> <div>{manualError}</div>
                </div>
              )}
              
              {manualSuccess && (
                <div className="mb-4 bg-emerald-50 text-emerald-800 border border-emerald-200 p-3 rounded-lg flex items-start gap-2 text-sm font-medium">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600" /> <div>{manualSuccess}</div>
                </div>
              )}

              <button 
                onClick={handleManualSave}
                disabled={isManualLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                {isManualLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Guardando...</> : <><Save className="w-5 h-5" /> Guardar Compra</>}
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
