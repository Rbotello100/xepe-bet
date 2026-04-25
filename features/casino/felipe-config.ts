/**
 * Configuracion del juego "¿Donde esta Felipe?"
 *
 * 24 salas donde Felipe Moya (gerente comercial) puede estar.
 * Las probabilidades suman exactamente 1.0 (100%).
 * El multiplicador se calcula como HOUSE_RTP / prob — RTP 95% = casa
 * se queda con 5% del valor esperado, juego favorable al usuario pero
 * sostenible.
 */

export type FelipeCategory =
  | 'revenue'
  | 'stakeholder'
  | 'ops'
  | 'analytics'
  | 'misterio'
  | 'amigos'
  | 'cultura'
  | 'producto'
  | 'negociacion'

export interface FelipeRoom {
  id: string
  name: string
  category: FelipeCategory
  prob: number
  lore: string
}

export const HOUSE_RTP = 0.95

export const FELIPE_ROOMS: FelipeRoom[] = [
  // Revenue core — sus salas naturales
  {
    id: 'country_manager',
    name: 'Country Manager',
    category: 'revenue',
    prob: 0.078,
    lore: 'Su casa. Reporta al jefe. Aparece cuando hay que defender los numeros o escalar algo urgente.',
  },
  {
    id: 'activacion_pyme',
    name: 'Activacion Pyme',
    category: 'revenue',
    prob: 0.085,
    lore: 'Revenue core. Alta probabilidad — esta ahi a empujar el pipeline y ver por que no llegan los clientes nuevos.',
  },
  {
    id: 'recurrencia_pyme',
    name: 'Recurrencia Pyme',
    category: 'revenue',
    prob: 0.072,
    lore: 'Revenue core. Va a revisar retencion y a presionar para que los clientes vuelvan a girar.',
  },
  {
    id: 'corps',
    name: 'Corps',
    category: 'revenue',
    prob: 0.052,
    lore: 'Revenue core. Entra cuando hay cuentas grandes en juego. No siempre, pero pasa.',
  },

  // Stakeholders
  {
    id: 'riesgo',
    name: 'Riesgo',
    category: 'stakeholder',
    prob: 0.059,
    lore: 'Viene a apelar. Cada vez que riesgo dice no, Felipe tiene algo que decir. Muy algo.',
  },
  {
    id: 'estrategia_comercial',
    name: 'Estrategia Comercial',
    category: 'stakeholder',
    prob: 0.065,
    lore: 'Su stakeholder principal. Va a alinear vision, revisar metricas y hacer slides que nadie leyo.',
  },

  // Ops
  {
    id: 'pre_giro',
    name: 'Pre Giro',
    category: 'ops',
    prob: 0.052,
    lore: 'Va a acelerar operaciones. Si un cliente esta esperando, Felipe esta ahi presionando.',
  },
  {
    id: 'gtm_strategy',
    name: 'GTM Strategy',
    category: 'ops',
    prob: 0.039,
    lore: 'A pedir recursos y coordinar cosas de activacion. Lleva slides, sale con tareas.',
  },
  {
    id: 'conciliaciones',
    name: 'Conciliaciones',
    category: 'ops',
    prob: 0.033,
    lore: 'Va a hablar con la Kari y resolver cosas de operaciones. El Felipe mas tranquilo.',
  },
  {
    id: 'normalizacion',
    name: 'Normalizacion',
    category: 'ops',
    prob: 0.033,
    lore: 'A hablar con Edu Pena sobre planes de pago. Mediador de lujo.',
  },
  {
    id: 'legal',
    name: 'Legal',
    category: 'ops',
    prob: 0.039,
    lore: 'A firmar capitales de trabajo y reirse con Monge. Mezcla perfecta de negocios y copuche.',
  },
  {
    id: 'tech_support',
    name: 'Tech Support',
    category: 'ops',
    prob: 0.020,
    lore: 'A cambiarle los PCs a sus ejecutivos. Felipe gestiona hasta el hardware.',
  },
  {
    id: 'cobranzas',
    name: 'Cobranzas',
    category: 'ops',
    prob: 0.033,
    lore: 'A agilizar operaciones y mediar entre su equipo comercial y los que cobran. Diplomacia.',
  },

  // Analytics
  {
    id: 'expand_lab',
    name: 'Expand Lab',
    category: 'analytics',
    prob: 0.026,
    lore: 'La pata analitica de riesgo. Va poco, pero cuando va, es porque los datos no le gustan.',
  },
  {
    id: 'data',
    name: 'Data',
    category: 'analytics',
    prob: 0.039,
    lore: 'A ver resultados y pelear porque el leaderboard no esta actualizado. Puntual con los reclamos.',
  },

  // SDRs / experimentos
  {
    id: 'sdrs',
    name: 'SDRs',
    category: 'revenue',
    prob: 0.033,
    lore: 'Va a pedir recursos. Siempre recursos. Mas SDRs, mas herramientas, mas todo.',
  },
  {
    id: 'sdrs_experimentos',
    name: 'SDRs Experimentos',
    category: 'revenue',
    prob: 0.026,
    lore: 'Igual que los SDRs pero con un deck de PowerPoint de por medio. Tambien a pedir recursos.',
  },

  // Misterio
  {
    id: 'sala_vacia',
    name: 'Sala Vacia (ex Recurrencia)',
    category: 'misterio',
    prob: 0.013,
    lore: 'Va a descansar. Rarisimo. Si lo encuentras ahi, guarda el momento para siempre.',
  },
  {
    id: 'conta',
    name: 'Conta',
    category: 'misterio',
    prob: 0.020,
    lore: 'Nadie sabe exactamente para que va, pero va. Felipe tambien es un misterio a veces.',
  },

  // Amigos
  {
    id: 'financiamiento_dcm',
    name: 'Financiamiento & DCM',
    category: 'amigos',
    prob: 0.046,
    lore: 'Estan JT y Cata Schele. Va a pedir salida a fondo y probablemente a tomar once.',
  },

  // Negociacion
  {
    id: 'finanzas',
    name: 'Finanzas',
    category: 'negociacion',
    prob: 0.039,
    lore: 'A negociar cumplimientos. Felipe lleva los numeros en la cabeza y los argumentos en la manga.',
  },

  // Cultura
  {
    id: 'people',
    name: 'People',
    category: 'cultura',
    prob: 0.039,
    lore: 'A reirse, copuchar, contratar gente, hacer movidas y desordenarles todo. Caos controlado.',
  },

  // Producto
  {
    id: 'banking',
    name: 'Banking',
    category: 'producto',
    prob: 0.026,
    lore: 'A sonar con el proximo producto revolucionario. Vision pura. Muy poca realidad operativa.',
  },
  {
    id: 'growth',
    name: 'Growth',
    category: 'producto',
    prob: 0.033,
    lore: 'A cambiarles el roadmap. Diariamente. Sin previo aviso. Los de growth ya lo saben.',
  },
]

/**
 * Multiplicador con house edge baked-in.
 * Truncado a 1 decimal para matchear la estetica de casa de apuestas.
 */
export function getRoomMultiplier(prob: number): number {
  return Math.floor((HOUSE_RTP / prob) * 10) / 10
}

/**
 * Pick ponderado server-side. Usado en la action revealFelipe.
 * NO exponer al cliente.
 */
export function pickWinningRoomServer(): string {
  const r = Math.random()
  let cumulative = 0
  for (const room of FELIPE_ROOMS) {
    cumulative += room.prob
    if (r < cumulative) return room.id
  }
  // fallback en caso de rounding (no deberia llegar aca)
  return FELIPE_ROOMS[FELIPE_ROOMS.length - 1].id
}

/**
 * Lookup helper para validar room_ids enviados por el cliente.
 */
export function getRoomById(id: string): FelipeRoom | undefined {
  return FELIPE_ROOMS.find(r => r.id === id)
}

/**
 * Chips permitidos. Cualquier monto fuera de esta lista se rechaza.
 */
export const FELIPE_CHIPS = [50, 100, 250, 500] as const
