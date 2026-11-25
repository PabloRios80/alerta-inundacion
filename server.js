require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));



const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Registrar o actualizar persona por DNI
app.post('/api/personas', async (req, res) => {
  const {
    operadora,
    apellido,
    nombre,
    dni,
    telefono,
    direccion_referencia,
    enfermedad_discapacidad,
    medico_centro_salud,
    medicacion,
    otras_observaciones,
    es_electrodependiente,
    criticidad,
    lat,
    lng
  } = req.body;

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const safeLat = Number.isFinite(latNum) ? latNum : -31.6333;
  const safeLng = Number.isFinite(lngNum) ? lngNum : -60.7000;

  const { data, error } = await supabase
    .from('personas_riesgo')
    .upsert([{
      apellido: apellido.trim().toUpperCase(),
      nombre: nombre.trim(),
      dni: dni.toString().replace(/\D/g, ''),
      telefono: telefono.toString().replace(/\D/g, ''),
      direccion_referencia,
      enfermedad_discapacidad,
      medico_centro_salud,
      medicacion,
      otras_observaciones,
      es_electrodependiente: Boolean(es_electrodependiente),
      criticidad,
      lat,
      lng,
      updated_at: new Date()
    }], { onConflict: 'dni' })
    .select();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ mensaje: 'Registro guardado correctamente', data });
});

function contarFrecuencias(registros, campo) {
  const conteo = {};

  for (const fila of registros) {
    const raw = fila[campo];
    if (!raw || typeof raw !== 'string') continue;

    // Separa por coma, punto y coma, barra o salto de línea
    const partes = raw
      .split(/[,;\/\n]+/)
      .map(item => item.trim().toLowerCase())
      .filter(item => item.length > 1 && item !== 'no' && item !== 'ninguna' && item !== 'ninguno');

    for (const parte of partes) {
      conteo[parte] = (conteo[parte] || 0) + 1;
    }
  }

  return Object.entries(conteo)
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

function estimarEdadPorDni(dniRaw) {
  if (!dniRaw) return null;
  const num = Number(String(dniRaw).replace(/\D/g, ''));
  if (!Number.isFinite(num) || num < 1000000 || num > 99999999) return null;

  // Estimación orientativa por rango de numeración de DNI en Argentina
  if (num >= 56000000) return 6;   // ~0 a 10
  if (num >= 46000000) return 15;  // ~10 a 20
  if (num >= 32000000) return 30;  // ~20 a 40
  if (num >= 20000000) return 50;  // ~40 a 60
  return 70;                       // ~Más de 60
}

function clasificarFranjaEtaria(edadEstimada) {
  if (edadEstimada === null || edadEstimada === undefined) return 'Sin dato';
  if (edadEstimada < 10) return '0 a 10';
  if (edadEstimada < 20) return '10 a 20';
  if (edadEstimada < 40) return '20 a 40';
  if (edadEstimada <= 60) return '40 a 60';
  return 'Más de 60';
}

app.get('/api/personas/:dni', async (req, res) => {
  try {
    const dniLimpio = String(req.params.dni || '').replace(/\D/g, '');
    if (!dniLimpio) {
      return res.status(400).json({ error: 'DNI inválido' });
    }

    const { data, error } = await supabase
      .from('personas_riesgo')
      .select('*')
      .eq('dni', dniLimpio)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: 'Ficha no encontrada' });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/estadisticas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('personas_riesgo')
      .select('*');

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const filas = data || [];
    const totalPersonas = filas.length;
    const totalElectrodependientes = filas.filter(f => Boolean(f.es_electrodependiente)).length;

    const ordenFranjas = ['0 a 10', '10 a 20', '20 a 40', '40 a 60', 'Más de 60', 'Sin dato'];
    const conteoFranjas = {
      '0 a 10': 0,
      '10 a 20': 0,
      '20 a 40': 0,
      '40 a 60': 0,
      'Más de 60': 0,
      'Sin dato': 0
    };

    const edadesEstimadas = [];

    for (const f of filas) {
      const edadEst = estimarEdadPorDni(f.dni);
      if (edadEst !== null) {
        edadesEstimadas.push(edadEst);
      }
      const franja = clasificarFranjaEtaria(edadEst);
      conteoFranjas[franja] = (conteoFranjas[franja] || 0) + 1;
    }

    const promedioEdadEstimado = edadesEstimadas.length > 0
      ? Number((edadesEstimadas.reduce((a, b) => a + b, 0) / edadesEstimadas.length).toFixed(1))
      : null;

    const franjasEtarias = ordenFranjas.map(rango => ({
      rango,
      cantidad: conteoFranjas[rango]
    }));

    const porCriticidad = { alta: 0, media: 0, baja: 0 };
    for (const f of filas) {
      const c = String(f.criticidad || 'media').toLowerCase().trim();
      if (porCriticidad[c] !== undefined) porCriticidad[c]++;
    }

    const topPatologias = contarFrecuencias(filas, 'enfermedad_discapacidad').slice(0, 10);
    const topMedicamentos = contarFrecuencias(filas, 'medicacion').slice(0, 10);
    const porOperadora = contarFrecuencias(filas, 'operadora').slice(0, 10);

    res.json({
      totalPersonas,
      totalElectrodependientes,
      promedioEdadEstimado,
      franjasEtarias,
      porCriticidad,
      topPatologias,
      topMedicamentos,
      porOperadora
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Obtener listado completo ordenado por criticidad y apellido
app.get('/api/personas', async (req, res) => {
  const { data, error } = await supabase
    .from('personas_riesgo')
    .select('*')
    .order('apellido', { ascending: true });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Actualizar estado operativo ('en_riesgo', 'contactado', 'evacuado')
app.patch('/api/personas/:id/estado', async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  const { data, error } = await supabase
    .from('personas_riesgo')
    .update({ estado, updated_at: new Date() })
    .eq('id', id)
    .select();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));