import * as THREE from 'three'

const LANE = 2.4
const LANES = [-LANE, 0, LANE]
const SPAWN_Z = -70
const KILL_Z = 8
const GRAVITY = 38
const JUMP_V = 13

// Mini endless runner em três pistas. Sem assets externos: tudo é geometria.
export function createRunner(canvas, { onScore, onState } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x070914)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x070914, 18, 62)
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 120)
  camera.position.set(0, 3.6, 7.5)
  camera.lookAt(0, 0.8, -8)

  scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x1a1030, 1.1))
  const sun = new THREE.DirectionalLight(0xffffff, 1.2)
  sun.position.set(3, 8, 6)
  scene.add(sun)

  // Chão com grade que corre
  const gridCanvas = document.createElement('canvas')
  gridCanvas.width = gridCanvas.height = 128
  const g = gridCanvas.getContext('2d')
  g.fillStyle = '#0b1024'
  g.fillRect(0, 0, 128, 128)
  g.strokeStyle = 'rgba(69,181,222,.85)'
  g.lineWidth = 3
  g.strokeRect(0, 0, 128, 128)
  const gridTex = new THREE.CanvasTexture(gridCanvas)
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping
  gridTex.repeat.set(5, 40)
  gridTex.anisotropy = 4
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(LANE * 3 + 1.2, 200),
    new THREE.MeshBasicMaterial({ map: gridTex }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.z = -60
  scene.add(ground)

  // Divisórias luminosas entre as pistas
  const railMat = new THREE.MeshBasicMaterial({ color: 0x8b5cf6 })
  ;[-LANE * 1.5 - 0.6, -LANE / 2, LANE / 2, LANE * 1.5 + 0.6].forEach((x, i) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(i === 0 || i === 3 ? 0.14 : 0.05, 0.05, 200), railMat)
    rail.position.set(x, 0.03, -60)
    scene.add(rail)
  })

  // Estrelas ao fundo
  const starGeo = new THREE.BufferGeometry()
  const starPos = new Float32Array(500 * 3)
  for (let i = 0; i < 500; i += 1) {
    starPos[i * 3] = (Math.random() - 0.5) * 120
    starPos[i * 3 + 1] = Math.random() * 40 + 2
    starPos[i * 3 + 2] = -Math.random() * 110
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbfe9ff, size: 0.18, transparent: true, opacity: 0.8 }))
  scene.add(stars)

  // Jogador
  const player = new THREE.Group()
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.8, 0),
    new THREE.MeshStandardMaterial({ color: 0x45b5de, emissive: 0x1f6f8c, emissiveIntensity: 1, metalness: 0.4, roughness: 0.3, flatShading: true }),
  )
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.15, 0.05, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0xc4b0ff, transparent: true, opacity: 0.8 }),
  )
  halo.rotation.x = Math.PI / 2
  player.add(core, halo)
  scene.add(player)

  // Obstáculos e moedas
  const blockGeo = new THREE.BoxGeometry(1.9, 2.4, 1.9)
  const lowGeo = new THREE.BoxGeometry(2.0, 0.7, 1.0)
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, emissive: 0x3b1d8a, flatShading: true })
  const lowMat = new THREE.MeshStandardMaterial({ color: 0xff5d8f, emissive: 0x7a1f40, flatShading: true })
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
  const blockEdges = new THREE.EdgesGeometry(blockGeo)
  const lowEdges = new THREE.EdgesGeometry(lowGeo)
  const coinGeo = new THREE.OctahedronGeometry(0.45, 0)
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffe28a, emissive: 0xb88a1f, emissiveIntensity: 0.9, flatShading: true })

  const items = []
  const makeObstacle = (low) => {
    const m = new THREE.Mesh(low ? lowGeo : blockGeo, low ? lowMat : blockMat)
    m.add(new THREE.LineSegments(low ? lowEdges : blockEdges, edgeMat))
    return m
  }

  const state = {
    mode: 'idle', // idle | playing | over
    lane: 1,
    targetX: 0,
    y: 0,
    vy: 0,
    speed: 0,
    distance: 0,
    coins: 0,
    spawnTimer: 0,
    time: 0,
  }
  let raf = 0
  let last = 0
  let running = false
  let shake = 0

  const setMode = (mode) => {
    state.mode = mode
    onState?.(mode)
  }
  const emitScore = () => onScore?.(Math.floor(state.distance) + state.coins * 10, state.coins)

  const clearItems = () => {
    items.splice(0).forEach((it) => scene.remove(it.mesh))
  }

  const spawn = () => {
    const lane = Math.floor(Math.random() * 3)
    const roll = Math.random()
    if (roll < 0.42) {
      const mesh = makeObstacle(false)
      mesh.position.set(LANES[lane], 1.2, SPAWN_Z)
      scene.add(mesh)
      items.push({ mesh, type: 'block', lane })
    } else if (roll < 0.62) {
      const mesh = makeObstacle(true)
      mesh.position.set(LANES[lane], 0.35, SPAWN_Z)
      scene.add(mesh)
      items.push({ mesh, type: 'low', lane })
    } else {
      for (let i = 0; i < 4; i += 1) {
        const mesh = new THREE.Mesh(coinGeo, coinMat)
        mesh.position.set(LANES[lane], 1.1, SPAWN_Z - i * 2.4)
        scene.add(mesh)
        items.push({ mesh, type: 'coin', lane })
      }
    }
  }

  const start = () => {
    clearItems()
    Object.assign(state, { lane: 1, targetX: 0, y: 0, vy: 0, speed: 15, distance: 0, coins: 0, spawnTimer: 0.4, time: 0 })
    player.position.set(0, 0, 0)
    shake = 0
    emitScore()
    setMode('playing')
  }

  const moveLane = (dir) => {
    if (state.mode !== 'playing') return
    state.lane = Math.max(0, Math.min(2, state.lane + dir))
    state.targetX = LANES[state.lane]
  }
  const jump = () => {
    if (state.mode !== 'playing' || state.y > 0.01) return
    state.vy = JUMP_V
  }

  const hit = () => {
    shake = 0.5
    setMode('over')
  }

  const update = (dt) => {
    // Cenário anima mesmo parado (modo idle) para parecer vivo
    const speed = state.mode === 'playing' ? state.speed : 5
    gridTex.offset.y -= (speed * dt) / (200 / 40)
    stars.rotation.y += dt * 0.01
    core.rotation.y += dt * 2
    core.rotation.x += dt * 0.8
    halo.rotation.z += dt * 2.4

    if (state.mode !== 'playing') {
      player.position.y = Math.sin(performance.now() / 400) * 0.15 + 0.9
      if (shake > 0) shake = Math.max(0, shake - dt)
      camera.position.x = shake ? (Math.random() - 0.5) * shake : 0
      return
    }

    state.time += dt
    state.speed = Math.min(36, 15 + state.time * 0.35)
    state.distance += state.speed * dt * 0.6

    // Movimento do jogador
    player.position.x += (state.targetX - player.position.x) * Math.min(1, dt * 14)
    state.vy -= GRAVITY * dt
    state.y = Math.max(0, state.y + state.vy * dt)
    if (state.y === 0 && state.vy < 0) state.vy = 0
    player.position.y = state.y + 0.9
    player.rotation.z = (state.targetX - player.position.x) * -0.25

    // Spawn
    state.spawnTimer -= dt
    if (state.spawnTimer <= 0) {
      spawn()
      state.spawnTimer = Math.max(0.45, 1.15 - state.time * 0.012) + Math.random() * 0.35
    }

    // Itens
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const it = items[i]
      it.mesh.position.z += state.speed * dt
      if (it.type === 'coin') it.mesh.rotation.y += dt * 4

      const dz = Math.abs(it.mesh.position.z - player.position.z)
      const dx = Math.abs(it.mesh.position.x - player.position.x)
      if (dz < 1.25 && dx < 1.15) {
        if (it.type === 'coin') {
          if (Math.abs(it.mesh.position.y - player.position.y) < 1.5) {
            state.coins += 1
            scene.remove(it.mesh)
            items.splice(i, 1)
            continue
          }
        } else if (it.type === 'block') {
          hit()
          return
        } else if (state.y < 0.75) {
          hit()
          return
        }
      }
      if (it.mesh.position.z > KILL_Z) {
        scene.remove(it.mesh)
        items.splice(i, 1)
      }
    }
    emitScore()
  }

  const frame = (now) => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016)
    last = now
    update(dt)
    renderer.render(scene, camera)
  }

  const resize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.fov = w / h < 0.9 ? 78 : 62
    camera.updateProjectionMatrix()
  }

  const setActive = (active) => {
    if (active && !running) {
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    } else if (!active && running) {
      running = false
      cancelAnimationFrame(raf)
    }
  }

  const dispose = () => {
    setActive(false)
    clearItems()
    ;[blockGeo, lowGeo, blockEdges, lowEdges, coinGeo, starGeo, ground.geometry, core.geometry, halo.geometry].forEach((x) => x.dispose())
    ;[blockMat, lowMat, edgeMat, coinMat, railMat, ground.material, core.material, halo.material, stars.material, gridTex].forEach((x) => x.dispose())
    renderer.dispose()
  }

  resize()
  renderer.render(scene, camera)

  return { start, left: () => moveLane(-1), right: () => moveLane(1), jump, resize, setActive, dispose, getMode: () => state.mode }
}
