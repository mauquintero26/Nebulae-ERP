"use client";

import { useState } from 'react';
import { X, Calendar, Tag } from 'lucide-react';

type Post = {
  id: number; titulo: string; extracto: string; contenido: string;
  categoria: string; fecha: string; img: string; autor: string;
};

const POSTS: Post[] = [
  {
    id: 1,
    titulo: 'Guia para vestirte con comodidad durante el embarazo',
    extracto: 'Descubre las claves para elegir ropa que acompane cada etapa de tu embarazo con estilo y bienestar.',
    contenido: 'El embarazo es una etapa maravillosa y unica. La eleccion de la ropa adecuada puede marcar una gran diferencia en tu bienestar diario. En esta guia te compartimos los tejidos mas recomendados, los cortes que mejor se adaptan a tu figura cambiante y los accesorios que no deben faltar en tu armario maternal.\n\nLos tejidos naturales como el algodon organico y el bambu son tus mejores aliados: transpiran bien, son suaves con la piel sensibilizada y se estiran con naturalidad. Evita los sinteticos ajustados que pueden generar incomodidad o irritacion.\n\nEn cuanto a cortes, las prendas con cintura elastica, los vestidos envolventes y las camisetas de corte recto son opciones versatiles que funcionan desde el primer hasta el noveno mes. Invertir en pocas piezas de calidad es mucho mejor que comprar muchas prendas que no te duran.',
    categoria: 'Maternidad',
    fecha: '15 Ago 2026',
    img: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=80&w=600&h=400',
    autor: 'Equipo Nebulae'
  },
  {
    id: 2,
    titulo: 'Lactancia y moda: como vestir practico y con estilo',
    extracto: 'La lactancia no tiene que ser un obstaculo para verte bien. Te mostramos las mejores prendas para este periodo.',
    contenido: 'Muchas mamas sienten que durante la lactancia deben sacrificar el estilo por la practicidad. En Nebulae creemos que ambas cosas van de la mano.\n\nLas prendas de acceso frontal con cierres disimulados, los vestidos con entretelados especiales y las camisetas con doble capa son disenos pensados para facilitar la lactancia sin renunciar a la elegancia. Ademas, los colores oscuros y los estampados son grandes aliados para disimular cualquier mancha.\n\nRecuerda que el bienestar emocional de la mama es tan importante como el fisico. Sentirte bien con lo que llevas puesto influye positivamente en tu estado de animo y en la vinculacion con tu bebe.',
    categoria: 'Maternidad',
    fecha: '02 Sep 2026',
    img: 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?auto=format&fit=crop&q=80&w=600&h=400',
    autor: 'Maria Lopez'
  },
  {
    id: 3,
    titulo: 'Bienestar total: rutina de autocuidado para mamas',
    extracto: 'Pequenos habitos que marcan la diferencia en tu salud fisica y emocional durante y despues del embarazo.',
    contenido: 'El autocuidado no es un lujo, es una necesidad. Las mamas tendemos a poner en ultimo lugar nuestras propias necesidades, pero cuidarnos es la mejor forma de cuidar a nuestros hijos.\n\nAlgunos habitos sencillos: dormir cuando el bebe duerme (sin culpa), hidratarte bien a lo largo del dia, salir a caminar al menos 20 minutos diarios y dedicar 5 minutos antes de dormir a una rutina de skincare que te haga sentir bien.\n\nEn Nebulae desarrollamos cada prenda pensando en tu comodidad real: telas suaves, costuras planas y cortes que no oprimen. Porque tu bienestar es nuestra prioridad.',
    categoria: 'Bienestar',
    fecha: '20 Ago 2026',
    img: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&q=80&w=600&h=400',
    autor: 'Ana Gutierrez'
  },
  {
    id: 4,
    titulo: '5 consejos para organizar el armario de tu bebe',
    extracto: 'Un closet bien organizado te ahorra tiempo y dolores de cabeza. Te damos los mejores tips para lograrlo.',
    contenido: 'Organizar la ropa de tu bebe puede parecer abrumador, especialmente cuando los regalos llegan de todas partes. Pero con un poco de planificacion, puede convertirse en algo muy sencillo.\n\n1. Clasifica por talla y temporada. Guarda en bolsas hermeticas la ropa que aun no le sirve.\n2. Usa etiquetas o rotulos. Segun el tipo de prenda o la ocasion.\n3. Dobla en vertical. La tecnica Marie Kondo funciona perfecto para las prendas de bebe.\n4. Separa lo de uso diario de lo de ocasiones especiales. Asi evitas ensuciarlo sin necesidad.\n5. Revisa mensualmente. Los bebes crecen muy rapido; lo que le quedaba bien hace un mes quiza ya es chico.',
    categoria: 'Consejos',
    fecha: '28 Ago 2026',
    img: 'https://images.unsplash.com/photo-1519340241574-2cec6aef0c01?auto=format&fit=crop&q=80&w=600&h=400',
    autor: 'Claudia Perez'
  },
];

const TABS = ['Todos', 'Maternidad', 'Bienestar', 'Consejos'];

export default function BlogPage() {
  const [activeTab, setActiveTab] = useState('Todos');
  const [activePost, setActivePost] = useState<Post | null>(null);

  const filtered = activeTab === 'Todos' ? POSTS : POSTS.filter((p) => p.categoria === activeTab);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-black text-slate-900 mb-3">Blog Nebulae</h1>
        <p className="text-slate-500 max-w-xl mx-auto">Consejos, tendencias y bienestar para la mama moderna y su familia.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap justify-center mb-10">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-5 py-2 rounded-full text-sm font-bold transition-all border-2 border-transparent"
            style={{
              background: activeTab === tab ? '#0f172a' : '#f1f5f9',
              color: activeTab === tab ? '#fff' : '#475569',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filtered.map((post) => (
          <article
            key={post.id}
            onClick={() => setActivePost(post)}
            className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-lg transition-all cursor-pointer group"
          >
            <div className="w-full h-48 overflow-hidden">
              <img src={post.img} alt={post.titulo} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            </div>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                  <Tag size={10} /> {post.categoria}
                </span>
                <span className="text-xs text-slate-400 flex items-center gap-1"><Calendar size={10} /> {post.fecha}</span>
              </div>
              <h2 className="font-extrabold text-slate-900 leading-tight mb-2 group-hover:text-emerald-600 transition-colors line-clamp-2">{post.titulo}</h2>
              <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">{post.extracto}</p>
              <p className="mt-4 text-xs font-bold text-emerald-600 hover:underline">Leer mas →</p>
            </div>
          </article>
        ))}
      </div>

      {/* Modal */}
      {activePost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setActivePost(null)} />
          <div className="relative bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white flex items-center justify-between p-6 border-b border-slate-100 z-10">
              <div className="flex items-center gap-2">
                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full">{activePost.categoria}</span>
                <span className="text-xs text-slate-400">{activePost.fecha}</span>
              </div>
              <button onClick={() => setActivePost(null)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            </div>
            <div className="w-full h-56 overflow-hidden">
              <img src={activePost.img} alt={activePost.titulo} className="w-full h-full object-cover" />
            </div>
            <div className="p-8">
              <h2 className="text-2xl font-black text-slate-900 mb-4">{activePost.titulo}</h2>
              <p className="text-sm text-slate-500 mb-6">Por {activePost.autor}</p>
              <div className="text-slate-700 leading-relaxed whitespace-pre-wrap text-sm">{activePost.contenido}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
