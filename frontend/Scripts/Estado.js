// Estado compartido entre pantallas (en memoria, se pierde al recargar).
export const Estado = {
  Usuario: null,
  Red: { modo: 'test' },
  Instituciones: [],
  Institucion_Activa: null,
  Estudiantes: [],
  Lotes: [],
  Precio_Unitario: 0.77,
};

export function Rol_Actual() {
  return Estado.Usuario?.rol || 'invitado';
}

export function Institucion_Actual() {
  const Id = Number(Estado.Institucion_Activa || Estado.Usuario?.institucion_id || Estado.Instituciones[0]?.id);
  return Estado.Instituciones.find((Institucion) => Number(Institucion.id) === Id) || Estado.Instituciones[0] || null;
}
