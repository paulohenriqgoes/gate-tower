/**
 * Gatilho de proximidade da torre inimiga (Etapa 4). Substitui o toque na
 * torre pelo jogador se aproximando dela: em tres testes de device seguidos
 * o toque na torre nao registrou em RA. A nova mecanica e um cogumelo com
 * uma caverna que "espia" conforme o jogador chega perto e solta o coelho
 * (inicio da partida) depois de ficar perto o suficiente por tempo continuo.
 *
 * E logica pura, sem Babylon: a distancia e o instante atual entram por
 * parametro, no mesmo espirito do `MatchClock` (`src/battle/MatchClock.ts`)
 * — sem `Date.now()` interno, pra ficar deterministico em teste e agnostico
 * de RA vs. modo tela. A distancia e em UNIDADES AUTORAIS, o mesmo sistema
 * de `AR_ARENA_SCALE` (`src/arena/ArenaSystem.ts`, 1 unidade ~= 3,33 cm em
 * RA): assim o mesmo numero de config vale nos dois modos de renderizacao.
 */

export type WakeStage = "asleep" | "peeking" | "leaping";

export interface ProximityTriggerConfig {
  /** Distancia (unidades autorais) abaixo da qual a caverna comeca a espiar. */
  peekDistanceUnits: number;
  /** Distancia (unidades autorais) abaixo da qual o dwell do salto passa a contar. */
  leapDistanceUnits: number;
  /**
   * Margem de histerese aplicada nas DUAS fronteiras (peek e leap): a
   * transicao "pra dentro" acontece no limiar puro, a transicao "pra fora"
   * so acima de limiar + hysteresisUnits. E o que evita que o tremor natural
   * da mao segurando o celular em cima do limiar faca o estado piscar frame
   * a frame — mesmo principio de banda morta do gate de posicionamento
   * (`src/ar/placementGate.ts`), so que aqui a entrada e uma distancia
   * continua, nao uma contagem de falhas.
   */
  hysteresisUnits: number;
  /** Quanto tempo CONTINUO abaixo de leapDistanceUnits ate o salto disparar. */
  leapDwellMs: number;
}

/**
 * Distancias calibradas com a telemetria de device de 2026-08-14 (sessao
 * `tower-gate-sessao-1786738188678.json`), e nao no chute. O que a sessao
 * mostrou, em 126 amostras de distancia camera-arena:
 *
 * - **mediana 1,91 m** — a pessoa passa a maior parte do tempo em pe, olhando
 *   a arena de longe. Um limiar de "espiar" em 60 cm (o valor original, 18
 *   unidades) quase nunca seria cruzado: a rampa de brilho ficaria invisivel
 *   durante quase toda a sessao, e a caverna nao chamaria ninguem;
 * - **minimo 0,252 m**, com ~3,5 s abaixo de 30 cm — quando ela mergulha, e
 *   ate ai. O limiar de salto original (7,5 unidades = 25 cm) foi raspado por
 *   2 mm em uma unica amostra: teria dependido de sorte, e o dwell de 800 ms
 *   provavelmente nao fecharia.
 *
 * Dai os valores atuais: espiar comeca a **1,0 m** (a pessoa se inclinando
 * sobre a mesa) e o salto dispara a **0,30 cm**, faixa onde a sessao mostra
 * 3,5 s de permanencia — folga de sobra para o dwell.
 *
 * A conversao e `AR_ARENA_SCALE` (1 unidade autoral = 3,33 cm em RA).
 */
const DEFAULT_CONFIG: ProximityTriggerConfig = {
  /** 30 unidades = ~1,00 m. */
  peekDistanceUnits: 30,
  /**
   * 13,5 unidades = ~0,45 m.
   *
   * Era 9 (0,30 m). O device de 2026-08-14 disparou certinho a 0,290 m — o
   * gatilho funcionou — mas o relato foi "tive que chegar muito perto para
   * liberar". 30 cm de um cogumelo de 15 cm exige quase encostar o celular
   * nele, o que e desconfortavel de segurar e arrisca esbarrar na mesa.
   * 45 cm ainda e uma aproximacao deliberada (a mediana da sessao foi 1,44 m,
   * entao ninguem chega la por acidente) e cabe num braco esticado sobre a
   * mesa. Na mesma sessao a pessoa levou 13,8 s indo de 0,97 m ate 0,29 m,
   * entao o Beat 4 continua confortavelmente acima dos 5 s que a spec usa
   * como piso de "o mundo nao convenceu".
   */
  leapDistanceUnits: 13.5,
  hysteresisUnits: 1.5,
  leapDwellMs: 800
};

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

/**
 * Maquina de estados que decide quando a torre inimiga acorda por
 * aproximacao. Sem nada de Babylon, sem alocacao por frame — `update()` e
 * seguro para chamar do render loop todo frame.
 */
export class ProximityTrigger {
  private readonly config: ProximityTriggerConfig;

  private stage: WakeStage = "asleep";

  // Flags de histerese (ver doc de `hysteresisUnits` acima): cada uma so
  // liga abaixo do limiar puro e so desliga acima de limiar + margem.
  private peekActive = false;
  private leapZoneActive = false;

  // Acumulador de dwell: soma so enquanto leapZoneActive esta ligado (com a
  // propria histerese, entao tremor na fronteira nao mexe nele). Qualquer
  // saida DE VERDADE da zona de salto zera — o dwell nao acumula em pedacos
  // espalhados, tem que ser continuo, por spec.
  private leapDwellAccumulatedMs = 0;

  // Ultimo instante visto por update(), pra calcular o delta entre frames.
  // null antes do primeiro update (ainda nao ha "delta" pra somar) e depois
  // de reset() (a contagem de dwell comeca do zero de novo).
  private lastUpdateMs: number | null = null;

  // Ultima distancia observada, guardada porque getGlowIntensity() nao
  // recebe parametro (contrato pede metodo sem argumento) e ainda assim
  // precisa refletir o ultimo estado conhecido.
  private lastDistanceUnits = Number.POSITIVE_INFINITY;

  public constructor(config?: Partial<ProximityTriggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public update(distanceUnits: number, nowMs: number): WakeStage {
    if (this.stage === "leaping") {
      // Terminal: nada mais a decidir ate reset(). Nao mexe no relogio
      // interno nem nos acumuladores, entao um reset() futuro comeca limpo.
      return this.stage;
    }

    // Delta de tempo protegido contra relogio andando pra tras ou saltando
    // (aba em segundo plano, tracking do 8th Wall interrompido, frame
    // perdido): nunca soma tempo negativo, e um salto grande so acelera o
    // dwell — nunca trava, nunca lanca excecao.
    const dtMs = this.lastUpdateMs === null ? 0 : Math.max(0, nowMs - this.lastUpdateMs);
    this.lastUpdateMs = nowMs;

    // Leitura ausente CONGELA a maquina — nao avanca nem zera nada.
    //
    // E a licao mais cara deste projeto, aplicada aqui de proposito: silencio
    // de sensor nao e evidencia (ver `src/ar/placementGate.ts` e o diario
    // `docs/experimentos/demo-mundo-vivo.md`). A distancia vem de uma pose de
    // camera que o SLAM pode deixar de produzir a qualquer momento; se o
    // acumulador continuasse somando durante o buraco, uma perda de tracking
    // com o jogador ja perto dispararia a batalha SEM ele ter chegado perto —
    // e se ele zerasse, um piscar de tracking apagaria um dwell quase
    // completo. Congelar e a unica leitura honesta de "nao sei".
    //
    // `lastUpdateMs` ja foi atualizado acima, entao o tempo do buraco fica de
    // fora do dwell em vez de entrar de uma vez na primeira leitura boa.
    if (Number.isNaN(distanceUnits)) {
      return this.stage;
    }

    // So depois da guarda de NaN: assim o brilho da caverna segura o ultimo
    // valor bom durante um engasgo de tracking, em vez de apagar e reacender.
    this.lastDistanceUnits = distanceUnits;

    // Histerese na fronteira de "peeking".
    if (this.peekActive) {
      if (distanceUnits > this.config.peekDistanceUnits + this.config.hysteresisUnits) {
        this.peekActive = false;
      }
    } else if (distanceUnits < this.config.peekDistanceUnits) {
      this.peekActive = true;
    }

    // Mesma histerese na fronteira de "leaping".
    if (this.leapZoneActive) {
      if (distanceUnits > this.config.leapDistanceUnits + this.config.hysteresisUnits) {
        this.leapZoneActive = false;
      }
    } else if (distanceUnits < this.config.leapDistanceUnits) {
      this.leapZoneActive = true;
    }

    if (this.leapZoneActive) {
      this.leapDwellAccumulatedMs += dtMs;
    } else {
      this.leapDwellAccumulatedMs = 0;
    }

    if (this.leapDwellAccumulatedMs >= this.config.leapDwellMs) {
      this.stage = "leaping";
    } else if (this.peekActive) {
      this.stage = "peeking";
    } else {
      this.stage = "asleep";
    }

    return this.stage;
  }

  public getStage(): WakeStage {
    return this.stage;
  }

  /**
   * Intensidade do brilho da caverna, continua em [0, 1] — nunca em degrau.
   *
   * Curva escolhida: smoothstep, `t * t * (3 - 2t)`, onde `t` e o quanto a
   * distancia ja andou de `peekDistanceUnits` (t=0) ate `leapDistanceUnits`
   * (t=1). Smoothstep em vez de rampa linear porque tem derivada zero nas
   * duas pontas: o brilho acelera suave ao entrar na faixa de peeking e
   * desacelera suave perto do limiar do salto, sem o "arranque" abrupto que
   * uma rampa linear teria bem na borda de cada estado — e o degrau em cima
   * do degrau e exatamente o tipo de transicao que fez o Beat 5 antigo
   * (toque direto) parecer um interruptor em vez de uma criatura reagindo.
   *
   * Entradas absurdas sao saneadas antes do calculo: NaN vira "infinitamente
   * longe" (glow 0 — o valor seguro quando o sensor de distancia nao informa
   * nada de confiavel), distancia negativa vira 0 (mais perto que
   * fisicamente possivel, glow 1). Isso preserva a monotonicidade mesmo nos
   * extremos.
   */
  public getGlowIntensity(): number {
    if (this.stage === "leaping") {
      return 1;
    }

    const raw = this.lastDistanceUnits;
    const sanitized = Number.isNaN(raw) ? Number.POSITIVE_INFINITY : Math.max(0, raw);

    const { peekDistanceUnits, leapDistanceUnits } = this.config;
    // Denominador nunca zero mesmo com config invertida (peek <= leap).
    const range = Math.max(1e-6, peekDistanceUnits - leapDistanceUnits);
    const t = clamp01((peekDistanceUnits - sanitized) / range);

    return t * t * (3 - 2 * t);
  }

  /** Volta ao estado inicial: `asleep`, sem dwell acumulado nem historico de tempo. */
  public reset(): void {
    this.stage = "asleep";
    this.peekActive = false;
    this.leapZoneActive = false;
    this.leapDwellAccumulatedMs = 0;
    this.lastUpdateMs = null;
    this.lastDistanceUnits = Number.POSITIVE_INFINITY;
  }
}
