import { describe, expect, it } from "vitest";

import { PlayerCore } from "./PlayerCore";

const OPTIONS = { bodyRadius: 0.55, groundY: 0.1375, maxHealth: 1000 };

describe("PlayerCore", () => {
  it("nasce com vida cheia e vivo", () => {
    const player = new PlayerCore(OPTIONS);

    expect(player.getHealth()).toBe(1000);
    expect(player.maxHealth).toBe(1000);
    expect(player.isAlive()).toBe(true);
  });

  it("fica na ORIGEM, no plano do chao — e nao segue camera nenhuma", () => {
    const player = new PlayerCore(OPTIONS);
    const position = player.getCombatPosition();

    expect(position.x).toBe(0);
    expect(position.z).toBe(0);
    expect(position.y).toBe(0.1375);
  });

  it("acumula dano ate morrer, e nunca passa de zero", () => {
    const player = new PlayerCore(OPTIONS);

    player.receiveCombatDamage(400);
    expect(player.getHealth()).toBe(600);

    player.receiveCombatDamage(400);
    expect(player.getHealth()).toBe(200);
    expect(player.isAlive()).toBe(true);

    // Um golpe maior do que a vida restante nao produz vida negativa: o HUD le
    // este numero direto, e um percentual negativo desenharia barra invertida.
    player.receiveCombatDamage(999);
    expect(player.getHealth()).toBe(0);
    expect(player.isAlive()).toBe(false);
  });

  it("morto nao apanha mais — a derrota dispara UMA vez", () => {
    const player = new PlayerCore(OPTIONS);

    player.receiveCombatDamage(1000);
    expect(player.getHealth()).toBe(0);

    // Sem esta guarda, cada inimigo ainda em campo continuaria "matando" o
    // jogador a cada frame, e quem observa a transicao viva -> morta veria a
    // derrota disparar em rajada.
    player.receiveCombatDamage(50);
    expect(player.getHealth()).toBe(0);
  });

  it("reset devolve a partida seguinte um jogador inteiro", () => {
    const player = new PlayerCore(OPTIONS);

    player.receiveCombatDamage(1000);
    expect(player.isAlive()).toBe(false);

    player.reset();

    expect(player.getHealth()).toBe(1000);
    expect(player.isAlive()).toBe(true);
  });

  it("declara o proprio raio de corpo — e por ele que o inimigo para longe o bastante para ser visto", () => {
    const player = new PlayerCore(OPTIONS);

    expect(player.getBodyRadius()).toBe(0.55);
  });
});
