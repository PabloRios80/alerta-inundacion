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