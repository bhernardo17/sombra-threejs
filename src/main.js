import './style.css'
import { createGame } from './game.js'

const $ = (id) => document.getElementById(id)
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const BEST_KEY = 'sombra-best-time'
const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0 } catch { return 0 } }
const saveBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)) } catch { /* sem armazenamento */ } }
const touch = window.matchMedia('(hover: none) and (pointer: coarse)').matches

let game
try {
  game = createGame($('canvas'), {
    touch,
    onHud: (h) => {
      $('luz').style.transform = `scaleX(${h.luz / 100})`
      $('sta').style.transform = `scaleX(${h.stamina / 100})`
      $('relics').textContent = `${h.collected}/${h.total}`
      $('time').textContent = fmt(h.elapsed)
      $('prox').style.transform = `scaleX(${h.prox})`
      $('vignette').style.setProperty('--dark', String(1 - h.luz / 100))
      $('hurt').style.opacity = String(Math.min(1, h.hurt * 1.4))
      $('threat').style.opacity = h.threat > 0.55 ? '1' : '0'
    },
    onMessage: (text) => {
      const t = $('toast')
      t.textContent = text
      t.classList.add('show')
      clearTimeout(onMessageTimer)
      onMessageTimer = setTimeout(() => t.classList.remove('show'), 3200)
    },
    onState: (mode, info) => {
      const playing = mode === 'playing'
      $('overlay').hidden = playing
      $('hud').hidden = !(playing || mode === 'paused')
      $('touch').hidden = !(touch && playing)
      $('keys').hidden = mode !== 'idle' && mode !== 'paused'
      if (mode === 'paused') {
        $('title').textContent = 'Pausa'
        $('sub').textContent = 'A névoa espera.'
        $('play').textContent = 'Continuar'
      } else if (mode === 'over') {
        $('title').textContent = 'Escuridão'
        $('sub').textContent = `A lanterna se apagou. Você reuniu ${info.collected} de ${info.total} relíquias.`
        $('play').textContent = 'Tentar de novo'
        $('hurt').style.opacity = '0'
        $('threat').style.opacity = '0'
      } else if (mode === 'won') {
        $('title').textContent = 'Amanhecer'
        const best = readBest()
        const record = !best || info.elapsed < best
        if (record) saveBest(info.elapsed)
        $('sub').textContent = `As sete relíquias brilham juntas e a névoa se desfaz. Tempo: ${fmt(info.elapsed)}${record ? ' · novo recorde!' : ` · melhor: ${fmt(best)}`}`
        $('play').textContent = 'Jogar de novo'
        $('threat').style.opacity = '0'
      }
    },
  })
} catch {
  $('unsupported').hidden = false
}
let onMessageTimer = 0

if (game) {
  game.setActive(true)
  window.addEventListener('resize', game.resize)
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause() })

  $('play').addEventListener('click', () => {
    const mode = game.getMode()
    if (mode === 'paused') { game.resume(); game.requestLock() } else { game.start(); game.requestLock() }
  })
  $('mute').addEventListener('click', () => $('mute').classList.toggle('off', game.toggleMute()))
  window.__game = game

  if (touch) {
    // Joystick virtual à esquerda; arrastar à direita gira a câmera
    const stick = $('stick')
    const knob = $('knob')
    let stickId = null
    let center = null
    const move = (e) => {
      const dx = e.clientX - center.x
      const dy = e.clientY - center.y
      const len = Math.min(52, Math.hypot(dx, dy))
      const a = Math.atan2(dy, dx)
      const kx = Math.cos(a) * len
      const ky = Math.sin(a) * len
      knob.style.transform = `translate(${kx}px, ${ky}px)`
      game.setStick(kx / 52, -ky / 52)
    }
    stick.addEventListener('pointerdown', (e) => {
      stickId = e.pointerId
      stick.setPointerCapture(stickId)
      const r = stick.getBoundingClientRect()
      center = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      move(e)
    })
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) move(e) })
    const end = (e) => {
      if (e.pointerId !== stickId) return
      stickId = null
      knob.style.transform = ''
      game.setStick(0, 0)
    }
    stick.addEventListener('pointerup', end)
    stick.addEventListener('pointercancel', end)

    $('tsprint').addEventListener('pointerdown', () => game.setSprint(true))
    $('tsprint').addEventListener('pointerup', () => game.setSprint(false))
    $('tsprint').addEventListener('pointercancel', () => game.setSprint(false))
    $('tflare').addEventListener('pointerdown', () => game.flare())

    let lookId = null
    let lx = 0
    let ly = 0
    const canvas = $('canvas')
    canvas.addEventListener('pointerdown', (e) => { lookId = e.pointerId; lx = e.clientX; ly = e.clientY })
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return
      game.look(e.clientX - lx, e.clientY - ly)
      lx = e.clientX
      ly = e.clientY
    })
    canvas.addEventListener('pointerup', () => { lookId = null })
    canvas.addEventListener('pointercancel', () => { lookId = null })
  }
}
