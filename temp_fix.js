const fs = require('fs');
let html = fs.readFileSync('play.html', 'utf8');

const startMarker = '            function iaElegirCarta() {';
const endMarker = '            // --- Decisión de cantar penal ---';

const start = html.indexOf(startMarker);
const end = html.indexOf(endMarker);

if (start === -1 || end === -1 || start > end) {
    console.log('ERROR: No se encontraron los marcadores');
    process.exit(1);
}

const correctVersion = `            function iaElegirCarta() {
                const mano = estado.manoCpu;
                if (!mano.length) return null;

                // === FLUJO CON CANTO PENDIENTE ===
                // Si hay un canto pendiente (el canto fue aceptado pero el rival
                // ya jugó su carta en la ronda normal), el CPU DEBE COMPLETAR LA
                // RONDA NORMAL primero con una carta de descarte (la más débil que
                // no sea la carta de ejecución del canto). La carta de ejecución
                // del canto se jugará en el siguiente turno cuando
                // penalActivo/golActivo sea true.
                if (estado.cantoPendiente) {
                    const pendiente = estado.cantoPendiente;
                    const esAtacante = pendiente.pedidoPor === 'cpu';

                    // Determinar qué carta se usará para EJECUTAR el canto luego
                    let cartaEjecucionCanto = null;
                    if (pendiente.tipo === 'penal') {
                        cartaEjecucionCanto = esAtacante
                            ? mejorCartaDe(mano, 'Del')
                            : mejorCartaDe(mano, 'Arq');
                    } else {
                        cartaEjecucionCanto = esAtacante
                            ? mejorCartaDe(mano, 'Del')
                            : mejorCartaDeVarias(mano, ['Arq', 'Def']);
                    }

                    // Para completar la ronda normal, tirar la carta MÁS DÉBIL
                    // que NO sea la necesaria para el canto (así la guardamos).
                    const descartables = cartaEjecucionCanto
                        ? mano.filter(c => c.id !== cartaEjecucionCanto.id)
                        : mano;

                    if (descartables.length) {
                        return descartables.reduce((a, b) => a.numero < b.numero ? a : b);
                    }

                    // Si solo queda la carta del canto, tirarla (no queda otra)
                    return cartaEjecucionCanto || mano[0];
                }

                // Si hay penal activo y CPU es el defensor, jugar el arquero más alto
                if (estado.penalActivo && estado.penalAtacante === 'jugador') {
                    const arq = mejorCartaDe(mano, 'Arq');
                    if (arq) return arq;
                    return mano.reduce((a, b) => a.numero < b.numero ? a : b);
                }

                // Si hay penal activo y CPU es el atacante, jugar el delantero más alto
                if (estado.penalActivo && estado.penalAtacante === 'cpu') {
                    const del = mejorCartaDe(mano, 'Del');
                    if (del) return del;
                    return mano.reduce((a, b) => a.numero < b.numero ? a : b);
                }

                // Si hay gol activo y CPU es el defensor, jugar Arq/Def más alto
                if (estado.golActivo && estado.golAtacante === 'jugador') {
                    const def = mejorCartaDeVarias(mano, ['Arq', 'Def']);
                    if (def) return def;
                    return mano.reduce((a, b) => a.numero < b.numero ? a : b);
                }

                // Si hay gol activo y CPU es el atacante, jugar el delantero más alto
                if (estado.golActivo && estado.golAtacante === 'cpu') {
                    const del = mejorCartaDe(mano, 'Del');
                    if (del) return del;
                    return mano.reduce((a, b) => a.numero < b.numero ? a : b);
                }

                // --- Juego normal ---
                const esMano = estado.turnoActual === estado.turnoInicial;
                const cartaJugador = cartasDeRondaActual().filter(c => c.origen === 'jugador').pop();
                const riesgo = iaNivelRiesgo();
                const puntosCpu = estado.puntosCpu;
                const puntosJugador = estado.puntosJugador;
                const quedanRondas = 4 - estado.rondaActual;

                // Guardar el mejor delantero si aún no se usó el canto de gol/penal
                const puedeCantarPenal = estado.rondaActual === 0 && !estado.penalUsado && !estado.penalCantadoPor;
                const puedeCantarGol = estado.rondaActual >= 1 && !estado.golUsado;
                const delantero = mejorCartaDe(mano, 'Del');
                const guardarDelantero = (puedeCantarPenal || puedeCantarGol) && delantero && delantero.numero >= 6;

                // Jugadores a 1 punto del gol
                const jugadorAlBordeDelGol = puntosJugador >= PUNTOS_PARA_GOL - 1;
                const cpuAlBordeDelGol = puntosCpu >= PUNTOS_PARA_GOL - 1;

                // Si el CPU es MANO (empieza la ronda)
                if (esMano) {
                    // Si el CPU está a 1 punto del gol, jugar la carta más alta
                    if (cpuAlBordeDelGol) {
                        return mano.reduce((a, b) => a.numero > b.numero ? a : b);
                    }

                    // Si el jugador está a 1 punto del gol, jugar carta fuerte
                    if (jugadorAlBordeDelGol) {
                        const candidatas = guardarDelantero
                            ? mano.filter(c => c.id !== delantero.id)
                            : mano;
                        if (candidatas.length) {
                            return candidatas.reduce((a, b) => a.numero > b.numero ? a : b);
                        }
                        return delantero;
                    }

                    // Si va ganando por puntos y quedan pocas rondas
                    if (puntosCpu >= 2 && quedanRondas <= 2 && puntosJugador === 0) {
                        const sinDel = mano.filter(c => !(guardarDelantero && c.id === delantero.id));
                        if (sinDel.length) {
                            return sinDel.reduce((a, b) => a.numero > b.numero ? a : b);
                        }
                    }

                    // Jugar carta fuerte para presionar (guardando delantero)
                    const candidatas = guardarDelantero
                        ? mano.filter(c => c.id !== delantero.id)
                        : mano;

                    if (candidatas.length) {
                        return candidatas.reduce((a, b) => a.numero > b.numero ? a : b);
                    }
                    return delantero;
                }

                // Si el CPU es PIE (responde a la carta del jugador)
                if (cartaJugador) {
                    const numeroJugador = cartaJugador.carta.numero;

                    // ¿Puedo ganar con alguna carta?
                    const ganadoras = mano.filter(c => c.numero > numeroJugador);
                    if (ganadoras.length) {
                        // Usar carta mínima para ganar (ahorra cartas fuertes)
                        let mejorOpcion = ganadoras.reduce((a, b) => a.numero < b.numero ? a : b);

                        // Si el CPU está a 1 punto del gol, usar la más alta
                        if (cpuAlBordeDelGol || jugadorAlBordeDelGol) {
                            return ganadoras.reduce((a, b) => a.numero > b.numero ? a : b);
                        }

                        // Si el delantero es la única que gana y hay que guardarlo
                        if (guardarDelantero && mejorOpcion.id === delantero.id) {
                            const otrasGanadoras = ganadoras.filter(c => c.id !== delantero.id);
                            if (otrasGanadoras.length) {
                                mejorOpcion = otrasGanadoras.reduce((a, b) => a.numero < b.numero ? a : b);
                            } else {
                                const ganoConEsto = puntosCpu + 1 >= PUNTOS_PARA_GOL;
                                const delanteroMuyAlto = delantero.numero >= 9;
                                if (ganoConEsto || !delanteroMuyAlto || riesgo > 0.6) {
                                    return mejorOpcion;
                                }
                                return mano.reduce((a, b) => a.numero < b.numero ? a : b);
                            }
                        }
                        return mejorOpcion;
                    }

                    // No puedo ganar: intentar empatar si el rival está a punto de hacer gol
                    const empates = mano.filter(c => c.numero === numeroJugador);
                    if (empates.length && puntosJugador + 1 >= PUNTOS_PARA_GOL) {
                        return empates[0];
                    }

                    // Sacrificar la carta más débil (guardando el delantero)
                    const sacrificables = guardarDelantero
                        ? mano.filter(c => c.id !== delantero.id)
                        : mano;

                    if (sacrificables.length) {
                        return sacrificables.reduce((a, b) => a.numero < b.numero ? a : b);
                    }
                    return delantero;
                }

                // Sin carta del jugador visible (caso raro): jugar la más alta
                return mano.reduce((a, b) => a.numero > b.numero ? a : b);
            }
`;

html = html.substring(0, start) + correctVersion + html.substring(end);
fs.writeFileSync('play.html', html);
console.log('Sección iaElegirCarta reconstruida correctamente');