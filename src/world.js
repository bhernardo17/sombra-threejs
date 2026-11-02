import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { fbm, mulberry32 } from './noise.js'

export const WORLD_R = 112
export const RELIC_COUNT = 7

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function heightAt(x, z) {
  const r = Math.hypot(x, z)
  const base = (fbm(x * 0.017 + 12.3, z * 0.017 + 4.7) - 0.5) * 16
  const flat = smoothstep(3, 18, r)
  const wall = r > 96 ? Math.pow((r - 96) / 16, 2) * 10 : 0
  return base * flat + wall
}

export function makeGlowTexture(color = '255,255,255') {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, `rgba(${color},1)`)
  grad.addColorStop(0.25, `rgba(${color},.45)`)
  grad.addColorStop(1, `rgba(${color},0)`)
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

function instanced(geo, mat, matrices) {
  const mesh = new THREE.InstancedMesh(geo, mat, matrices.length)
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
  mesh.instanceMatrix.needsUpdate = true
  mesh.frustumCulled = false
  return mesh
}

const tmp = new THREE.Object3D()
function matrix(x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) {
  tmp.position.set(x, y, z)
  tmp.rotation.set(rx, ry, rz)
  tmp.scale.set(sx, sy, sz)
  tmp.updateMatrix()
  return tmp.matrix.clone()
}

export function buildWorld(scene) {
  const rng = mulberry32(1337)
  const colliders = [] // {x, z, r}
  const disposables = []

  // ---- Terreno
  const SEG = 150
  const size = WORLD_R * 2 + 20
  const geo = new THREE.PlaneGeometry(size, size, SEG, SEG)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const col = new THREE.Color()
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = heightAt(x, z)
    pos.setY(i, h)
    const n = fbm(x * 0.09, z * 0.09, 3)
    col.setHSL(0.35 - n * 0.12, 0.16 + n * 0.1, 0.07 + Math.max(0, h) * 0.006 + n * 0.05)
    colors[i * 3] = col.r
    colors[i * 3 + 1] = col.g
    colors[i * 3 + 2] = col.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }))
  scene.add(ground)
  disposables.push(geo, ground.material)

  const free = (x, z, r) => colliders.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + r)
  const randPos = (minR, maxR) => {
    const a = rng() * Math.PI * 2
    const d = minR + Math.sqrt(rng()) * (maxR - minR)
    return [Math.cos(a) * d, Math.sin(a) * d]
  }

  // ---- Santuários e relíquias
  const shrines = []
  let guard = 0
  while (shrines.length < RELIC_COUNT && guard < 500) {
    guard += 1
    const [x, z] = randPos(28, 92)
    if (shrines.every((s) => Math.hypot(s.x - x, s.z - z) > 32)) shrines.push({ x, z })
  }

  const pillarMatrices = []
  const baseMatrices = []
  shrines.forEach((s) => {
    const y = heightAt(s.x, s.z)
    baseMatrices.push(matrix(s.x, y + 0.1, s.z, 3.1, 0.35, 3.1))
    const n = 4
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + rng()
      const px = s.x + Math.cos(a) * 3.1
      const pz = s.z + Math.sin(a) * 3.1
      const broken = rng() < 0.4
      const h = broken ? 2 + rng() * 1.5 : 5 + rng() * 1.5
      pillarMatrices.push(matrix(px, heightAt(px, pz) + h / 2 - 0.3, pz, 1, h, 1, rng() * 6, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08))
      colliders.push({ x: px, z: pz, r: 0.7 })
    }
    colliders.push({ x: s.x, z: s.z, r: 0.01 })
  })

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x343946, roughness: 0.95, flatShading: true })
  const pillarGeo = new THREE.CylinderGeometry(0.55, 0.65, 1, 7)
  const baseGeo = new THREE.CylinderGeometry(1, 1.1, 1, 14)
  scene.add(instanced(pillarGeo, stoneMat, pillarMatrices), instanced(baseGeo, stoneMat, baseMatrices))
  disposables.push(pillarGeo, baseGeo, stoneMat)

  // Relíquias (orbes flutuantes + brilho + feixe visível de longe)
  const glowTex = makeGlowTexture('150,240,255')
  const relicGeo = new THREE.IcosahedronGeometry(0.5, 0)
  const relicMat = new THREE.MeshStandardMaterial({ color: 0xbff6ff, emissive: 0x58d6ee, emissiveIntensity: 2.2, flatShading: true })
  const beamGeo = new THREE.CylinderGeometry(0.1, 0.1, 80, 8, 1, true)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x79e4ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })
  const relics = shrines.map((s, i) => {
    const y = heightAt(s.x, s.z) + 2.3
    const group = new THREE.Group()
    group.position.set(s.x, y, s.z)
    const orb = new THREE.Mesh(relicGeo, relicMat)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x7fe8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }))
    glow.scale.setScalar(5)
    const beam = new THREE.Mesh(beamGeo, beamMat)
    beam.position.y = 38
    group.add(orb, glow, beam)
    scene.add(group)
    return { id: i, x: s.x, z: s.z, y, group, orb, glow, beam, taken: false, seed: rng() * 10 }
  })
  disposables.push(relicGeo, relicMat, beamGeo, beamMat, glowTex)

  // ---- Árvores secas
  const trunk = new THREE.CylinderGeometry(0.14, 0.38, 6, 6)
  trunk.translate(0, 3, 0)
  const parts = [trunk]
  for (let i = 0; i < 5; i += 1) {
    const len = 1.6 + (i % 3) * 0.7
    const br = new THREE.CylinderGeometry(0.04, 0.12, len, 5)
    br.translate(0, len / 2, 0)
    br.rotateZ(0.7 + (i % 2) * 0.5)
    br.rotateY((i / 5) * Math.PI * 2 + 0.4)
    br.translate(0, 2.4 + i * 0.75, 0)
    parts.push(br)
  }
  const treeGeo = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x1d1814, roughness: 1, flatShading: true })
  const treeMatrices = []
  for (let i = 0, tries = 0; i < 330 && tries < 3000; tries += 1) {
    const [x, z] = randPos(7, WORLD_R - 4)
    if (!free(x, z, 0.9)) continue
    const s = 0.8 + rng() * 1.1
    treeMatrices.push(matrix(x, heightAt(x, z) - 0.2, z, s, s * (0.8 + rng() * 0.6), s, rng() * 6, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.12))
    colliders.push({ x, z, r: 0.45 * s })
    i += 1
  }
  scene.add(instanced(treeGeo, treeMat, treeMatrices))
  disposables.push(treeGeo, treeMat)

  // ---- Rochas
  const rockGeo = new THREE.DodecahedronGeometry(1, 0)
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 1, flatShading: true })
  const rockMatrices = []
  for (let i = 0, tries = 0; i < 110 && tries < 2000; tries += 1) {
    const [x, z] = randPos(6, WORLD_R - 4)
    const s = 0.6 + rng() * 1.8
    if (!free(x, z, s)) continue
    rockMatrices.push(matrix(x, heightAt(x, z) + s * 0.25, z, s, s * (0.6 + rng() * 0.4), s, rng() * 6, rng(), rng()))
    colliders.push({ x, z, r: s * 0.85 })
    i += 1
  }
  scene.add(instanced(rockGeo, rockMat, rockMatrices))
  disposables.push(rockGeo, rockMat)

  // ---- Cemitérios
  const graveGeo = new THREE.BoxGeometry(0.85, 1.3, 0.26)
  graveGeo.translate(0, 0.55, 0)
  const graveMat = new THREE.MeshStandardMaterial({ color: 0x3b414e, roughness: 0.9, flatShading: true })
  const graveMatrices = []
  for (let c = 0; c < 5; c += 1) {
    const [cx, cz] = randPos(14, 85)
    for (let i = 0; i < 12; i += 1) {
      const x = cx + (i % 4) * 2.3 + (rng() - 0.5) * 0.5
      const z = cz + Math.floor(i / 4) * 2.6 + (rng() - 0.5) * 0.5
      if (!free(x, z, 0.6)) continue
      graveMatrices.push(matrix(x, heightAt(x, z) - 0.1, z, 0.8 + rng() * 0.4, 0.7 + rng() * 0.6, 1, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.25, (rng() - 0.5) * 0.25))
      colliders.push({ x, z, r: 0.55 })
    }
  }
  scene.add(instanced(graveGeo, graveMat, graveMatrices))
  disposables.push(graveGeo, graveMat)

  return {
    colliders,
    relics,
    shrines,
    update(t) {
      relics.forEach((r) => {
        if (r.taken) return
        r.orb.rotation.y = t * 1.2 + r.seed
        r.orb.rotation.x = t * 0.7
        r.orb.position.y = Math.sin(t * 1.6 + r.seed) * 0.25
        r.glow.material.opacity = 0.65 + Math.sin(t * 3 + r.seed) * 0.2
      })
    },
    collect(relic) {
      relic.taken = true
      relic.group.visible = false
    },
    dispose() {
      disposables.forEach((d) => d.dispose())
    },
  }
}
