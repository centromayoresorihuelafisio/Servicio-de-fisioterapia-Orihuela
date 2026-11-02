# Entrega de la app con contraseña y plan de emergencia

Para el dueño. Partes A a E: se hacen una vez, en este orden, antes de la baja (17-nov-2026); la prueba con el sustituto, hacia el **10-nov-2026**. La parte F es el plan de emergencia: guárdala a mano en el móvil durante la baja.
Marca cada casilla al hacerla. Si algo falla, para y apunta qué ha pasado (mejor con una captura).

---

## A. Subir lo de la conversación 7 y comprobarlo en la de prueba
- [ ] **A1.** En GitHub Desktop, estando en la rama `control-acceso`: commit de los cambios («Control de acceso: conversación 7»).
- [ ] **A2.** En la terminal, en la carpeta del proyecto y **todavía en la rama `control-acceso`**: `clasp push`.
- [ ] **A3.** En la implementación de prueba (la que has usado en las fases 1 a 4):
  - `?page=pruebaAcceso` ya no existe: ahora abre Usuarios.
  - Repaso rápido de que todo sigue igual: Usuarios, Agenda, Valoraciones, Estadísticas y Configuración cargan; menú de tu nombre con «Ver como usuario» y «Cerrar sesión».

## B. Publicar la versión con contraseña en la dirección de siempre
Antes de esto, la dirección real sigue abierta a cualquiera que la tenga. Después, solo se entra con usuario y contraseña.
- [ ] **B1. La hoja sigue siendo solo tuya.** Abre la hoja de cálculo › botón «Compartir»: solo debe aparecer tu cuenta. Haz lo mismo en el proyecto de Apps Script (icono de compartir, arriba a la derecha). Si hay alguien más, quítalo.
- [ ] **B2. Nueva versión en la implementación real.** En el editor de Apps Script: **Implementar › Administrar implementaciones**. Elige la implementación cuya dirección (acaba en `/exec`) es la que usas siempre. Pulsa el **lápiz** (editar) y:
  - Versión: **Nueva versión**. Descripción: `Control de acceso`.
  - Ejecutar como: **Yo**.
  - Quién tiene acceso: **Cualquier usuario** (así el sustituto entra sin cuenta de Google; la puerta es la contraseña de la app).
  - Pulsa **Implementar**. La dirección no cambia.
- [ ] **B3. Apunta el número de esa versión** (sale en la misma ventana, p. ej. «Versión 37») en la parte F, apartado «Versión buena».
- [ ] **B4. Prueba de la puerta.** Abre la dirección de siempre en una **ventana de incógnito** (Ctrl+Mayús+N): solo debe verse la pantalla de entrar, sin ningún dato. Entra con tu usuario de administrador y comprueba que ves las cinco pestañas.
- [ ] **B5. Archivar las demás implementaciones.** Vuelve a **Implementar › Administrar implementaciones**. Cada implementación **que no sea la real** sigue funcionando con su código antiguo, sin contraseña. Para cada una: selecciónala › **Archivar**. Deja **solo la real**. (La de «Probar implementaciones», cuya dirección acaba en `/dev`, no sale en esa lista y no hace falta tocarla: solo funciona con tu cuenta de Google.)

## C. Cuenta del sustituto
- [ ] **C1.** En la app real: **Configuración › Accesos › Nueva cuenta**. Usuario para entrar: `FisioCMO2`. Nombre: el suyo (o déjalo vacío hasta saberlo). Rol: **Usuario**. Caduca: **vacío** (le quitarás el acceso a mano al volver). Pulsa «Crear cuenta».
- [ ] **C2.** La **contraseña temporal** sale una sola vez: apúntala en un papel y dásela en mano. No la mandes por WhatsApp ni por correo.
- [ ] **C3.** Imprime la guía `GUIA_SUSTITUTO.md` y escribe en su apartado «Cómo avisar» cómo te localiza y qué hace si no contestas.
- [ ] **C4.** Comprueba en **Configuración › Registro** que aparece la fila `accesosCrear` con `FisioCMO2`.

## D. Prueba con el sustituto (hacia el 10-nov-2026), en la app real
Con el sustituto delante, en su ordenador si es posible.
- [ ] **D1. Primera entrada**: entra con `FisioCMO2` y la temporal; la app le obliga a poner una contraseña suya. Luego cierra sesión y vuelve a entrar con la nueva.
- [ ] **D2. Lo que ve**: solo Usuarios, Agenda y Valoraciones; no hay Estadísticas, Configuración ni «Eliminar» en Usuarios. Si escribe a mano `?page=configuracion` o `?page=dashboard` al final de la dirección, vuelve a Usuarios con el aviso «Esa página es solo para el administrador».
- [ ] **D3. Una jornada normal** con usuarios de prueba o reales con cuidado: buscar un usuario, añadir uno nuevo, editarlo, cambiar su estado, abrir y escribir en su historia clínica (se guarda sola), dar y mover una cita, marcar asistencia, borrar una cita y deshacer, una valoración, un recordatorio, un WhatsApp, dar un alta.
- [ ] **D4. Dos personas a la vez**: tú con tu cuenta en tu ordenador y él con la suya, trabajando a la vez en Usuarios y en la Agenda: no se pisan; como mucho sale «Otra persona está guardando cambios».
- [ ] **D5. Bloqueo**: que falle la contraseña 5 veces: sale «Demasiados intentos…» y te llega un correo. Desbloquéalo en **Configuración › Accesos › Desbloquear**.
- [ ] **D6. Simulacro nivel 1** (parte F): **Desactivar** `FisioCMO2` en Configuración; en su siguiente clic le sale la pantalla de entrar y no puede entrar («Este acceso está desactivado»). Vuelve a **Activar**.
- [ ] **D7. Simulacro nivel 1 desde el móvil**: en la app de Hojas de cálculo, hoja «Accesos», pon la columna `activo` de `FisioCMO2` en `FALSO`. Antes de 1 minuto deja de poder trabajar. Vuelve a ponerla en `VERDADERO`.
- [ ] **D8. Simulacro nivel 2**: **Configuración › Emergencia**, interruptor «Suspender». Él sale en su siguiente acción («El acceso está suspendido por ahora»); tú sigues dentro. Quita el interruptor y vuelve a entrar.
- [ ] **D9. Recuperación desde el móvil**: abre la dirección de la app en el navegador del móvil, entra con tu usuario y, en **Configuración › Accesos**, pulsa **Restablecer contraseña** en `FisioCMO2`. Dale la temporal; al entrar, él elige otra. Si en el móvil la pantalla se ve muy pequeña, prueba «Ver versión para ordenador» del navegador y amplía con los dedos. Si no hay manera, apúntalo: sin móvil, solo quedan los apartados de la parte F que se pueden hacer desde la hoja.
- [ ] **D10. Simulacro nivel 4 (volver a una versión anterior)**: en el editor, **Implementar › Administrar implementaciones › lápiz › Versión: Nueva versión** (el mismo código: así hay dos versiones con contraseña). Después vuelve a editar y elige la versión de B3. Abre la app: sigue pidiendo contraseña y todo funciona. Vuelve a dejar la más reciente.
- [ ] **D11. Registro**: en **Configuración › Registro**, filtra por usuario `FisioCMO2`: deben salir sus entradas, el bloqueo, los usuarios añadidos y dados de alta, la cita borrada y las ediciones de historia clínica. Con usuario de administrador, las filas de lo que hiciste en «Ver como usuario» dicen «administrador (como usuario)».
- [ ] **D12. Cierre por tiempo**: deja la app abierta sin tocarla más de 60 minutos; al volver a usarla pide la contraseña sin perder lo que había escrito.

## E. Cuando todo esté comprobado
- [ ] **E1.** Apunta en la parte F el número de la versión buena definitiva (la última que hayas dejado en la implementación real).
- [ ] **E2.** En GitHub Desktop: une la rama `control-acceso` a `main` (cambia a `main` › menú *Branch* › *Merge into current branch* › `control-acceso`) y pulsa *Push origin*. Desde ahí se vuelve a trabajar en `main`.
- [ ] **E3.** Díselo a Claude en una conversación nueva para que deje `CONTEXTO.md` con la sección 17 cerrada y anote la versión buena.

---

## F. Plan de emergencia (definitivo)
**Regla de oro: ninguna de estas opciones deja la app abierta sin contraseña.** Van de menos a más grave.

**Versión buena (con contraseña):** número ______ . Nunca elijas una versión con un número menor que **el de B3: ______**, porque son anteriores a la contraseña.

| Nivel | Cuándo | Cómo | Desde | Tarda | Para deshacer |
|---|---|---|---|---|---|
| **1. Desactivar a una persona** | Sospechas que alguien usa su contraseña, o ya no debe entrar | Configuración › Accesos › **Desactivar**. Desde la hoja: «Accesos», columna `activo` en `FALSO` | Ordenador o móvil | Al momento (desde la hoja, hasta 1 minuto) | **Activar** (o `VERDADERO`) |
| **2. Suspender a todos menos a ti** | Algo raro y no sabes quién | Configuración › Emergencia › interruptor **Suspender**. Desde el editor: `accesoSuspenderUsuarios` | Ordenador o móvil (Configuración) | En su siguiente acción | Quitar el interruptor, o `accesoReanudarUsuarios` |
| **3. Cerrar la app a todos, también a ti** | Sospecha de intrusión | Editor de Apps Script › elegir `accesoCerrarApp` › Ejecutar | Solo ordenador | Al momento | `accesoAbrirApp`, también desde el editor |
| **4. Volver a una versión anterior con contraseña** | Una versión nueva falla | Implementar › Administrar implementaciones › lápiz › Versión: la buena | Solo ordenador | Al momento; la dirección y los datos no cambian | Volver a elegir la más reciente |

**No hagas nunca, ni en una urgencia:**
- Elegir una versión anterior a la contraseña (número menor que el de B3): la app quedaría abierta a cualquiera que tenga la dirección.
- Archivar la implementación real: la dirección dejaría de funcionar y habría que dar otra nueva.
- Cambiar «Quién tiene acceso» o compartir la hoja de cálculo con alguien.

**Casos frecuentes**
- **El sustituto olvida la contraseña**: Configuración › Accesos › **Restablecer contraseña** en su cuenta (también desde el móvil, apartado D9). Dale la temporal por teléfono, de palabra; al entrar elegirá otra.
- **El sustituto está bloqueado** (5 fallos): espera 15 minutos o pulsa **Desbloquear**. Te llega un correo con cada bloqueo: si no ha sido él, mira **Configuración › Registro** y piensa en el nivel 1 o 2.
- **Te quedas tú sin poder entrar** (olvido, bloqueo o te desactivaste): en el editor de Apps Script ejecuta `accesoCrearAdministrador`. Reactiva y desbloquea la cuenta `administrador` y pone una contraseña temporal, que sale en el registro de ejecución. Si a tu cuenta le cambiaste el usuario, crea otra llamada `administrador`.
- **Se borró un usuario por error**: Configuración › Registro › acción `eliminarPacienteWeb` (o `eliminarPacientesLoteWeb`, si se borraron varios) › **Recuperar usuario** en su fila.
- **Hay que recuperar texto de una historia clínica**: en la hoja de cálculo, Archivo › Historial de versiones.
- **Si el sustituto no te localiza**: _(acuérdalo con él y escríbelo aquí y en su guía; por ejemplo, seguir trabajando con papel y pasarlo después)_.

**Al volver de la baja**: Configuración › Accesos › **Desactivar** (o **Eliminar**) `FisioCMO2`.
