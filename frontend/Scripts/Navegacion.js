// Vistas (acceso, registro de estudiantes, app) y pantallas dentro de la app.
// Cada módulo registra sus pantallas con Registrar_Pantalla().
import { Estado, Rol_Actual } from './Estado.js';
import { Poner_Texto, Mostrar_Aviso } from './Utilidades.js';

const Pantallas = {};
const Inicio_Por_Rol = { admin: 'instituciones', viewer: 'tablero', student: 'certificados', invitado: 'verificar' };
const Nombres_Rol = { admin: 'Administración', viewer: 'Administración institucional', student: 'Estudiante', invitado: 'Acceso público' };

export function Registrar_Pantalla(Nombre, { Titulo, Roles, Al_Mostrar }) {
  Pantallas[Nombre] = { Titulo, Roles, Al_Mostrar };
}

export function Mostrar_Vista(Id_Vista) {
  document.querySelectorAll('.vista').forEach((Vista) => Vista.classList.toggle('activa', Vista.id === Id_Vista));
}

function Aplicar_Usuario() {
  const Rol = Rol_Actual();
  const Nombre = Estado.Usuario?.nombre || 'Visitante';
  Poner_Texto('usuario-nombre', Nombre);
  Poner_Texto('usuario-rol', Nombres_Rol[Rol]);
  Poner_Texto('usuario-iniciales', Nombre.split(/\s+/).slice(0, 2).map((Parte) => Parte[0] || '').join('').toUpperCase());
  Poner_Texto('boton-sesion', Estado.Usuario ? 'Cerrar sesión' : 'Iniciar sesión');
  document.body.dataset.rol = Rol;
  document.querySelectorAll('[data-rol]').forEach((Nodo) => { Nodo.hidden = Nodo.dataset.rol !== Rol; });
  document.querySelectorAll('[data-solo-invitado]').forEach((Nodo) => { Nodo.hidden = Boolean(Estado.Usuario); });
}

export function Pantalla_Inicio() {
  return Inicio_Por_Rol[Rol_Actual()];
}

export function Mostrar_Pantalla(Nombre) {
  const Rol = Rol_Actual();
  if (!Pantallas[Nombre] || !Pantallas[Nombre].Roles.includes(Rol)) Nombre = Pantalla_Inicio();
  const Pantalla = Pantallas[Nombre];

  Mostrar_Vista('vista-app');
  Aplicar_Usuario();
  document.body.classList.remove('menu-abierto');
  document.querySelectorAll('.pantalla').forEach((Nodo) => { Nodo.hidden = Nodo.dataset.pantalla !== Nombre; });
  document.querySelectorAll('[data-pantalla-ir]').forEach((Nodo) => Nodo.classList.toggle('activo', Nodo.dataset.pantallaIr === Nombre));
  Poner_Texto('barra-titulo', Pantalla.Titulo);
  window.scrollTo(0, 0);
  (async () => Pantalla.Al_Mostrar?.())().catch((Error_Pantalla) => Mostrar_Aviso(Error_Pantalla.message, true));
}
