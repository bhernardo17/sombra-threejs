import * as THREE from 'three'

// Viajante encapuzado com lanterna, feito só de primitivas.
export function createCharacter() {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const cloakMat = new THREE.MeshStandardMaterial({ color: 0x353d58, roughness: 0.85, emissive: 0x141a2e, flatShading: true })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f121b, roughness: 1, flatShading: true })
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x9a8a80, roughness: 0.8 })

  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.6, 9, 1, true), cloakMat)
  cloak.material.side = THREE.DoubleSide
  cloak.position.y = 0.8
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), cloakMat)
  shoulders.scale.set(1.1, 0.6, 0.9)
  shoulders.position.y = 1.5
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), darkMat)
  hood.scale.set(1, 1.1, 1.1)
  hood.position.set(0, 1.82, -0.05)
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skinMat)
  face.position.set(0, 1.72, 0.1)
  const faceShade = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), darkMat)
  faceShade.position.set(0, 1.76, 0.07)
  body.add(cloak, shoulders, hood, face, faceShade)

  // Braço + lanterna
  const arm = new THREE.Group()
  arm.position.set(0.42, 1.45, 0.05)
  const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.6, 6), cloakMat)
  armMesh.position.set(0.05, -0.2, 0.2)
  armMesh.rotation.x = -1.1
  arm.add(armMesh)

  const lantern = new THREE.Group()
  lantern.position.set(0.08, -0.38, 0.55)
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.6, metalness: 0.5 })
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xff9a3c, emissiveIntensity: 3 })
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), glassMat)
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.12, 4), frameMat)
  top.position.y = 0.2
  top.rotation.y = Math.PI / 4
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.24), frameMat)
  bottom.position.y = -0.16
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 12, Math.PI), frameMat)
  handle.position.y = 0.26
  lantern.add(glass, top, bottom, handle)
  arm.add(lantern)
  body.add(arm)

  const light = new THREE.PointLight(0xffa850, 90, 26, 2)
  lantern.add(light)

  return {
    root,
    body,
    arm,
    lantern,
    light,
    glassMat,
    dispose() {
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
      })
      ;[cloakMat, darkMat, skinMat, frameMat, glassMat].forEach((m) => m.dispose())
    },
  }
}

// Sombra errante: manto escuro com olhos que brilham de longe.
export function createWraith(glowTexture) {
  const g = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0b0f1a, emissive: 0x070a16, roughness: 1, transparent: true, opacity: 0.92 })
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.6, 8, 1, true), bodyMat)
  body.material.side = THREE.DoubleSide
  body.position.y = 1.3
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), bodyMat)
  head.position.y = 2.7
  head.scale.set(1, 1.2, 1)
  const eyeMat = new THREE.SpriteMaterial({ map: glowTexture, color: 0xe8f6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  const e1 = new THREE.Sprite(eyeMat)
  const e2 = new THREE.Sprite(eyeMat)
  e1.scale.setScalar(0.5)
  e2.scale.setScalar(0.5)
  e1.position.set(-0.15, 2.75, 0.32)
  e2.position.set(0.15, 2.75, 0.32)
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0x203a7a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }))
  aura.scale.set(4, 5, 1)
  aura.position.y = 1.6
  g.add(body, head, e1, e2, aura)
  return {
    group: g,
    dispose() {
      body.geometry.dispose()
      head.geometry.dispose()
      bodyMat.dispose()
      eyeMat.dispose()
      aura.material.dispose()
    },
  }
}
