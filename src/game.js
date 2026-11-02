import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { buildWorld, heightAt, makeGlowTexture, RELIC_COUNT, WORLD_R } from './world.js'
import { createCharacter, createWraith } from './character.js'
import { createAudio } from './audio.js'
import { mulberry32 } from './noise.js'

const WALK = 5.2
const SPRINT = 8.6
const WRAITH_COUNT = 6
const FLARE_CD = 11

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

export function createGame(canvas, { onHud, onState, onMessage, touch = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.25 : 1.75))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15

  const FOG = 0x070b14
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(FOG)
  scene.fog = new THREE.FogExp2(FOG, 0.03)
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400)

  scene.add(new THREE.HemisphereLight(0x4a5f9a, 0x0a0a12, 0.55))
  const moon = new THREE.DirectionalLight(0x7f96d8, 0.85)
  moon.position.set(-60, 90, -80)
  scene.add(moon)

  const world = buildWorld(scene)
  const audio = createAudio()

  // Céu: estrelas e lua acompanham o jogador
  const starGeo = new THREE.BufferGeometry()
  const starPos = new Float32Array(900 * 3)
  const srng = mulberry32(7)
  for (let i = 0; i < 900; i += 1) {
    const a = srng() * Math.PI * 2
    const y = srng() * 0.95 + 0.05
    const r = Math.sqrt(1 - y * y)
    starPos[i * 3] = Math.cos(a) * r * 300
    starPos[i * 3 + 1] = y * 300
    starPos[i * 3 + 2] = Math.sin(a) * r * 300
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.75 }))
  scene.add(stars)
  const moonTex = makeGlowTexture('200,215,255')
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  moonSprite.scale.setScalar(140)
  scene.add(moonSprite)

  // Vaga-lumes
  const FF = 140
  const ffGeo = new THREE.BufferGeometry()
  const ffPos = new Float32Array(FF * 3)
  const ffSeed = new Float32Array(FF)
  for (let i = 0; i < FF; i += 1) {
    ffPos[i * 3] = (srng() - 0.5) * 60
    ffPos[i * 3 + 1] = srng() * 5
    ffPos[i * 3 + 2] = (srng() - 0.5) * 60
    ffSeed[i] = srng() * 10
  }
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3))
  const ffTex = makeGlowTexture('200,255,160')
  const fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({ map: ffTex, size: 0.38, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xd8ffa8 }))
  fireflies.frustumCulled = false
  scene.add(fireflies)

  // Personagem
  const hero = createCharacter()
  scene.add(hero.root)

  // Sombras de contato (dão peso aos corpos no chão)
  const blobCanvas = document.createElement('canvas')
  blobCanvas.width = blobCanvas.height = 64
  const bg = blobCanvas.getContext('2d')
  const bgrad = bg.createRadialGradient(32, 32, 0, 32, 32, 32)
  bgrad.addColorStop(0, 'rgba(0,0,0,.75)')
  bgrad.addColorStop(1, 'rgba(0,0,0,0)')
  bg.fillStyle = bgrad
  bg.fillRect(0, 0, 64, 64)
  const blobTex = new THREE.CanvasTexture(blobCanvas)
  const blobGeo = new THREE.PlaneGeometry(1, 1)
  blobGeo.rotateX(-Math.PI / 2)
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  const heroBlob = new THREE.Mesh(blobGeo, blobMat)
  heroBlob.scale.setScalar(2.2)
  scene.add(heroBlob)

  // Névoa baixa ao redor dos santuários
  const mistTex = makeGlowTexture('150,175,215')
  const mists = []
  world.shrines.forEach((sh) => {
    for (let i = 0; i < 5; i += 1) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.16, depthWrite: false }))
      const a = (i / 5) * Math.PI * 2
      m.position.set(sh.x + Math.cos(a) * 3, heightAt(sh.x, sh.z) + 1.1, sh.z + Math.sin(a) * 3)
      m.scale.set(13, 5, 1)
      m.userData = { a, cx: sh.x, cz: sh.z, base: heightAt(sh.x, sh.z) }
      scene.add(m)
      mists.push(m)
    }
  })

  // Anel do clarão
  const flareRing = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 48),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  flareRing.rotation.x = -Math.PI / 2
  scene.add(flareRing)

  // Sombras
  const glowTex = makeGlowTexture('255,255,255')
  const wraiths = []
  for (let i = 0; i < WRAITH_COUNT; i += 1) {
    const w = createWraith(glowTex)
    scene.add(w.group)
    const wblob = new THREE.Mesh(blobGeo, blobMat)
    wblob.scale.setScalar(2.8)
    scene.add(wblob)
    wraiths.push({ ...w, blob: wblob, x: 0, z: 0, tx: 0, tz: 0, stun: 0, cooldown: 0, state: 'wander', seed: srng() * 10 })
  }

  // Pós-processamento
  let composer = null
  let bloom = null
  if (!touch) {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.7, 0.82)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
  }

  // ---- Estado
  const S = {
    mode: 'idle', // idle | playing | paused | over | won
    x: 0, z: 4, vx: 0, vz: 0,
    facing: Math.PI,
    yaw: 0, pitch: 0.28,
    luz: 100, stamina: 100,
    collected: 0,
    flareCd: 0, flareT: 0,
    time: 0, stepT: 0, elapsed: 0, owlT: 12,
    shake: 0, hurtFlash: 0,
    sprinting: false,
    speedMul: 1,
  }
  const input = { keys: new Set(), stick: { x: 0, y: 0 }, sprint: false }
  let raf = 0
  let running = false
  let last = 0
  let locked = false

  const rrng = mulberry32(99)
  const spawnWraith = (w) => {
    for (let k = 0; k < 20; k += 1) {
      const a = rrng() * Math.PI * 2
      const d = 36 + rrng() * 50
      const x = S.x + Math.cos(a) * d
      const z = S.z + Math.sin(a) * d
      if (Math.hypot(x, z) < WORLD_R - 10) {
        w.x = x
        w.z = z
        break
      }
    }
    w.tx = w.x
    w.tz = w.z
    w.state = 'wander'
    w.stun = 0
  }

  const setMode = (m) => {
    S.mode = m
    if (m !== 'playing' && document.pointerLockElement) document.exitPointerLock()
    onState?.(m, { collected: S.collected, total: RELIC_COUNT, elapsed: S.elapsed })
  }

  const reset = () => {
    Object.assign(S, { x: 0, z: 4, vx: 0, vz: 0, facing: Math.PI, yaw: 0, pitch: 0.28, luz: 100, stamina: 100, collected: 0, flareCd: 0, flareT: 0, time: 0, stepT: 0, elapsed: 0, owlT: 12, shake: 0, hurtFlash: 0, speedMul: 1 })
    world.relics.forEach((r) => {
      r.taken = false
      r.group.visible = true
    })
    wraiths.forEach(spawnWraith)
  }

  const start = () => {
    audio.start()
    reset()
    setMode('playing')
    onMessage?.('Encontre as relíquias. Siga os feixes de luz.')
  }

  const resume = () => {
    if (S.mode === 'paused') {
      audio.resume()
      setMode('playing')
    }
  }
  const pause = () => {
    if (S.mode === 'playing') {
      if (document.pointerLockElement) document.exitPointerLock()
      audio.suspend()
      setMode('paused')
    }
  }

  const flare = () => {
    if (S.mode !== 'playing' || S.flareCd > 0 || S.luz < 12) return
    S.flareCd = FLARE_CD
    S.flareT = 0.9
    S.luz -= 8
    audio.flare()
    wraiths.forEach((w) => {
      const d = Math.hypot(w.x - S.x, w.z - S.z)
      if (d < 16) {
        w.stun = 4
        const nx = (w.x - S.x) / (d || 1)
        const nz = (w.z - S.z) / (d || 1)
        w.x += nx * 7
        w.z += nz * 7
      }
    })
  }

  const collide = (r) => {
    for (const c of world.colliders) {
      const dx = S.x - c.x
      const dz = S.z - c.z
      const min = c.r + r
      const d2 = dx * dx + dz * dz
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2)
        S.x = c.x + (dx / d) * min
        S.z = c.z + (dz / d) * min
      }
    }
    const rr = Math.hypot(S.x, S.z)
    if (rr > WORLD_R - 4) {
      S.x *= (WORLD_R - 4) / rr
      S.z *= (WORLD_R - 4) / rr
    }
  }

  const update = (dt) => {
    S.time += dt
    S.elapsed += dt
    S.owlT -= dt
    if (S.owlT <= 0) { audio.owl(); S.owlT = 14 + rrng() * 20 }
    world.update(S.time)
    mists.forEach((m) => {
      const d = m.userData
      const a = d.a + S.time * 0.05
      m.position.set(d.cx + Math.cos(a) * 3.2, d.base + 1.1 + Math.sin(S.time * 0.4 + d.a) * 0.2, d.cz + Math.sin(a) * 3.2)
    })

    // ---- Movimento
    let ix = (input.keys.has('d') || input.keys.has('arrowright') ? 1 : 0) - (input.keys.has('a') || input.keys.has('arrowleft') ? 1 : 0)
    let iy = (input.keys.has('w') || input.keys.has('arrowup') ? 1 : 0) - (input.keys.has('s') || input.keys.has('arrowdown') ? 1 : 0)
    ix += input.stick.x
    iy += input.stick.y
    const len = Math.hypot(ix, iy)
    if (len > 1) { ix /= len; iy /= len }
    if (input.keys.has('q')) S.yaw += dt * 1.8
    if (input.keys.has('e')) S.yaw -= dt * 1.8

    const wantSprint = (input.keys.has('shift') || input.sprint) && len > 0.1 && S.stamina > 5
    S.sprinting = wantSprint
    S.stamina = clamp(S.stamina + (wantSprint ? -28 : 16) * dt, 0, 100)
    const speed = (wantSprint ? SPRINT : WALK) * S.speedMul

    const fx = -Math.sin(S.yaw)
    const fz = -Math.cos(S.yaw)
    const rx = Math.cos(S.yaw)
    const rz = -Math.sin(S.yaw)
    const tvx = (fx * iy + rx * ix) * speed
    const tvz = (fz * iy + rz * ix) * speed
    const k = Math.min(1, dt * 9)
    S.vx += (tvx - S.vx) * k
    S.vz += (tvz - S.vz) * k
    S.x += S.vx * dt
    S.z += S.vz * dt
    collide(0.45)
    const moving = Math.hypot(S.vx, S.vz)
    if (moving > 0.6) S.facing = angleLerp(S.facing, Math.atan2(S.vx, S.vz), Math.min(1, dt * 12))

    // Passos
    if (moving > 1) {
      S.stepT -= dt * (moving / 4)
      if (S.stepT <= 0) {
        audio.step(wantSprint)
        S.stepT = 0.75
      }
    }

    // ---- Luz e lanterna
    S.luz = clamp(S.luz + 1.6 * dt, 0, 100)
    S.flareCd = Math.max(0, S.flareCd - dt)
    S.flareT = Math.max(0, S.flareT - dt)
    S.hurtFlash = Math.max(0, S.hurtFlash - dt)
    S.shake = Math.max(0, S.shake - dt * 1.5)
    const unstable = S.luz < 30 ? 3.5 : 1
    const flicker = 0.92 + (Math.sin(S.time * 13) * 0.03 + Math.sin(S.time * 7.3) * 0.04) * unstable + (S.luz < 30 ? Math.sin(S.time * 31) * 0.05 : 0)
    const lightLevel = 0.25 + (S.luz / 100) * 0.75
    hero.light.intensity = 95 * lightLevel * flicker * (1 + S.flareT * 5)
    hero.light.distance = 14 + lightLevel * 14 + S.flareT * 20
    hero.glassMat.emissiveIntensity = 1.5 + lightLevel * 2

    // ---- Personagem
    const gy = heightAt(S.x, S.z)
    const bob = Math.sin(S.time * (wantSprint ? 14 : 9)) * 0.06 * Math.min(1, moving / 3)
    hero.root.position.set(S.x, gy + bob, S.z)
    heroBlob.position.set(S.x, gy + 0.06, S.z)
    hero.root.rotation.y = S.facing
    hero.body.rotation.z = Math.sin(S.time * (wantSprint ? 14 : 9)) * 0.04 * Math.min(1, moving / 3)
    hero.body.rotation.x = Math.min(0.25, moving * 0.025)
    hero.arm.rotation.x = -0.1 + Math.sin(S.time * 9) * 0.06 * Math.min(1, moving / 3)
    hero.lantern.rotation.z = Math.sin(S.time * 5.5) * 0.12 * Math.min(1, 0.4 + moving / 4)

    // ---- Relíquias
    let nearest = Infinity
    world.relics.forEach((r) => {
      if (r.taken) return
      const d = Math.hypot(r.x - S.x, r.z - S.z)
      nearest = Math.min(nearest, d)
      if (d < 2.6) {
        world.collect(r)
        S.collected += 1
        S.luz = clamp(S.luz + 25, 0, 100)
        S.speedMul = 1 + S.collected * 0.01
        audio.relic()
        onMessage?.(S.collected === RELIC_COUNT ? 'A última relíquia. A escuridão recua.' : `Relíquia ${S.collected} de ${RELIC_COUNT}`)
        if (S.collected === RELIC_COUNT) {
          audio.win()
          setMode('won')
        }
      }
    })
    const prox = nearest === Infinity ? 0 : clamp(1 - nearest / 55, 0, 1)
    audio.setProximity(prox)

    // ---- Sombras
    let threat = 0
    wraiths.forEach((w) => {
      w.cooldown = Math.max(0, w.cooldown - dt)
      w.stun = Math.max(0, w.stun - dt)
      const dx = S.x - w.x
      const dz = S.z - w.z
      const d = Math.hypot(dx, dz)
      const chaseR = wantSprint ? 34 : 24
      if (w.stun <= 0) {
        if (d < chaseR) w.state = 'chase'
        else if (d > chaseR + 14) w.state = 'wander'
        let sp = 1.4
        if (w.state === 'chase') {
          w.tx = S.x
          w.tz = S.z
          sp = (4.2 + S.collected * 0.3) * (S.luz < 35 ? 1.12 : 1)
        } else if (Math.hypot(w.tx - w.x, w.tz - w.z) < 2) {
          const a = rrng() * Math.PI * 2
          w.tx = clamp(w.x + Math.cos(a) * 20, -WORLD_R + 8, WORLD_R - 8)
          w.tz = clamp(w.z + Math.sin(a) * 20, -WORLD_R + 8, WORLD_R - 8)
        }
        const td = Math.hypot(w.tx - w.x, w.tz - w.z) || 1
        w.x += ((w.tx - w.x) / td) * sp * dt
        w.z += ((w.tz - w.z) / td) * sp * dt
      }
      const wy = heightAt(w.x, w.z) + 0.2 + Math.sin(S.time * 2 + w.seed) * 0.25
      w.group.position.set(w.x, wy, w.z)
      w.blob.position.set(w.x, heightAt(w.x, w.z) + 0.06, w.z)
      w.group.rotation.y = Math.atan2(dx, dz)
      w.group.children[0].rotation.z = Math.sin(S.time * 3 + w.seed) * 0.08
      w.group.visible = true
      const near = clamp(1 - d / 28, 0, 1)
      threat = Math.max(threat, w.stun > 0 ? 0 : near)
      if (d < 1.3 && w.cooldown <= 0 && w.stun <= 0) {
        S.luz = clamp(S.luz - 24, 0, 100)
        S.hurtFlash = 0.7
        S.shake = 0.6
        audio.hurt()
        w.cooldown = 2
        spawnWraith(w)
        if (S.luz <= 0) {
          audio.lose()
          setMode('over')
        }
      }
    })
    audio.setThreat(threat)

    // ---- Anel do clarão
    if (S.flareT > 0) {
      const p = 1 - S.flareT / 0.9
      flareRing.position.set(S.x, gy + 0.3, S.z)
      flareRing.scale.setScalar(1 + p * 16)
      flareRing.material.opacity = (1 - p) * 0.8
    } else flareRing.material.opacity = 0

    onHud?.({ elapsed: S.elapsed, luz: S.luz, stamina: S.stamina, collected: S.collected, total: RELIC_COUNT, prox, threat, flareCd: S.flareCd / FLARE_CD, hurt: S.hurtFlash })
  }

  let baseFov = 62
  const updateCamera = (dt) => {
    const dist = 6.4
    const target = new THREE.Vector3(S.x, heightAt(S.x, S.z) + 1.9, S.z)
    const cp = Math.cos(S.pitch)
    const desired = new THREE.Vector3(
      target.x + Math.sin(S.yaw) * cp * dist,
      target.y + Math.sin(S.pitch) * dist,
      target.z + Math.cos(S.yaw) * cp * dist,
    )
    const floor = heightAt(desired.x, desired.z) + 0.9
    if (desired.y < floor) desired.y = floor
    const wantFov = baseFov + (S.mode === 'playing' && S.sprinting ? 9 : 0)
    if (Math.abs(camera.fov - wantFov) > 0.05) {
      camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 6)
      camera.updateProjectionMatrix()
    }
    camera.position.lerp(desired, Math.min(1, dt * 10))
    if (S.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * S.shake * 0.25
      camera.position.y += (Math.random() - 0.5) * S.shake * 0.25
    }
    camera.lookAt(target)

    // Ambiente acompanha
    stars.position.copy(camera.position)
    moonSprite.position.set(camera.position.x - 120, camera.position.y + 130, camera.position.z - 200)
    // Vaga-lumes orbitam o jogador
    const p = ffGeo.attributes.position
    for (let i = 0; i < FF; i += 1) {
      const ox = ffPos[i * 3]
      const oz = ffPos[i * 3 + 2]
      const wx = ((ox - S.x + 30) % 60 + 60) % 60 - 30
      const wz = ((oz - S.z + 30) % 60 + 60) % 60 - 30
      const x = S.x + wx + Math.sin(S.time * 0.5 + ffSeed[i]) * 1.2
      const z = S.z + wz + Math.cos(S.time * 0.4 + ffSeed[i]) * 1.2
      p.setXYZ(i, x, heightAt(x, z) + 0.6 + (ffPos[i * 3 + 1] % 4) + Math.sin(S.time + ffSeed[i]) * 0.4, z)
    }
    p.needsUpdate = true
  }

  const syncStatic = () => {
    hero.root.position.set(S.x, heightAt(S.x, S.z), S.z)
    hero.root.rotation.y = S.facing
    heroBlob.position.set(S.x, heightAt(S.x, S.z) + 0.06, S.z)
    wraiths.forEach((w) => {
      w.group.position.set(w.x, heightAt(w.x, w.z) + 0.3, w.z)
      w.blob.position.set(w.x, heightAt(w.x, w.z) + 0.06, w.z)
      w.group.rotation.y = Math.atan2(S.x - w.x, S.z - w.z)
    })
  }

  const frame = (now) => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016)
    last = now
    if (S.mode === 'playing') update(dt)
    else if (S.mode === 'idle' || S.mode === 'over' || S.mode === 'won' || S.mode === 'paused') {
      S.time += dt
      world.update(S.time)
      if (S.mode === 'idle') S.yaw += dt * 0.12
      syncStatic()
    }
    updateCamera(dt)
    // Ajuste dinâmico do brilho: mais vinheta quando a luz acaba é feito no CSS
    if (composer) composer.render()
    else renderer.render(scene, camera)
  }

  const resize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    baseFov = w / h < 0.9 ? 74 : 62
    camera.fov = baseFov
    camera.updateProjectionMatrix()
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio())
      composer.setSize(w, h)
      bloom.resolution.set(w, h)
    }
  }

  const setActive = (a) => {
    if (a && !running) {
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    } else if (!a && running) {
      running = false
      cancelAnimationFrame(raf)
    }
  }

  // ---- Entrada
  const onKeyDown = (e) => {
    const k = e.key.toLowerCase()
    if (['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      input.keys.add(k)
      if (k.startsWith('arrow')) e.preventDefault()
    }
    if (k === 'f' || k === ' ') { flare(); e.preventDefault() }
    if (k === 'escape' || k === 'p') (S.mode === 'paused' ? resume : pause)()
    if (k === 'm') audio.setMuted(!audio.isMuted())
  }
  const onKeyUp = (e) => input.keys.delete(e.key.toLowerCase())
  const onBlur = () => input.keys.clear()
  const onMouseMove = (e) => {
    if (S.mode !== 'playing') return
    if (locked || e.buttons === 1) {
      S.yaw -= e.movementX * 0.0035
      S.pitch = clamp(S.pitch + e.movementY * 0.003, -0.1, 1.0)
    }
  }
  const onLockChange = () => {
    locked = document.pointerLockElement === canvas
    if (!locked && S.mode === 'playing' && !touch) pause()
  }
  const onCanvasClick = () => {
    if (S.mode === 'playing' && !touch && !locked) canvas.requestPointerLock?.()
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  window.addEventListener('mousemove', onMouseMove)
  document.addEventListener('pointerlockchange', onLockChange)
  canvas.addEventListener('click', onCanvasClick)

  reset()
  syncStatic()
  resize()

  return {
    start, resume, pause, flare, resize, setActive,
    getMode: () => S.mode,
    requestLock: () => { if (!touch) canvas.requestPointerLock?.() },
    setStick: (x, y) => { input.stick.x = x; input.stick.y = y },
    setSprint: (v) => { input.sprint = v },
    look: (dx, dy) => {
      S.yaw -= dx * 0.006
      S.pitch = clamp(S.pitch + dy * 0.005, -0.1, 1.0)
    },
    toggleMute: () => { audio.setMuted(!audio.isMuted()); return audio.isMuted() },
    debug: S,
    debugWorld: world,
    debugWraiths: wraiths,
    dispose() {
      setActive(false)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onLockChange)
      canvas.removeEventListener('click', onCanvasClick)
      world.dispose()
      blobGeo.dispose()
      blobMat.dispose()
      blobTex.dispose()
      mistTex.dispose()
      mists.forEach((m) => m.material.dispose())
      hero.dispose()
      wraiths.forEach((w) => w.dispose())
      composer?.dispose()
      renderer.dispose()
    },
  }
}
