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

app.get('/api/estadisticas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('personas_riesgo')
      .select('edad, enfermedad_discapacidad, medicacion, es_electrodependiente, criticidad, estado, operadora');

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const filas = data || [];
    const totalPersonas = filas.length;
    const totalElectrodependientes = filas.filter(f => Boolean(f.es_electrodependiente)).length;

    // Promedio de edad (solo sobre registros con edad numérica válida)
    const edadesValidas = filas
      .map(f => Number(f.edad))
      .filter(n => Number.isFinite(n) && n > 0 && n < 125);

    const promedioEdad = edadesValidas.length > 0
      ? Number((edadesValidas.reduce((acc, n) => acc + n, 0) / edadesValidas.length).toFixed(1))
      : null;

    // Conteo por criticidad
    const porCriticidad = { alta: 0, media: 0, baja: 0 };
    for (const f of filas) {
      const c = (f.criticidad || 'media').toLowerCase();
      if (porCriticidad[c] !== undefined) porCriticidad[c]++;
    }

    // Top patologías y medicamentos
    const topPatologias = contarFrecuencias(filas, 'enfermedad_discapacidad').slice(0, 10);
    const topMedicamentos = contarFrecuencias(filas, 'medicacion').slice(0, 10);
    const porOperadora = contarFrecuencias(filas, 'operadora').slice(0, 10);

    res.json({
      totalPersonas,
      totalElectrodependientes,
      promedioEdad,
      cantidadConEdad: edadesValidas.length,
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