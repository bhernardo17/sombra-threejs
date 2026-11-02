import './style.css'
import { createRunner } from './game.js'

const $ = (id) => document.getElementById(id)
const BEST_KEY = 'neon-runner-best'
const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0 } catch { return 0 } }
const saveBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)) } catch { /* sem armazenamento */ } }

let best = readBest()
let score = 0
$('best').textContent = best

let game
try {
  game = createRunner($('canvas'), {
    onScore: (s, c) => { score = s; $('score').textContent = s; $('coins').textContent = c },
    onState: (mode) => {
      const playing = mode === 'playing'
      $('overlay').hidden = playing
      if (mode === 'over') {
        if (score > best) { best = score; saveBest(best); $('best').textContent = best }
        $('result').hidden = false
        $('result').textContent = `Fim de jogo · ${score} pontos${score >= best && score > 0 ? ' · novo recorde!' : ''}`
        $('play').textContent = 'Jogar de novo'
      }
    },
  })
} catch {
  $('unsupported').hidden = false
}

if (game) {
  game.setActive(true)
  window.addEventListener('resize', game.resize)
  document.addEventListener('visibilitychange', () => game.setActive(!document.hidden))

  $('play').addEventListener('click', () => game.start())
  $('bl').addEventListener('click', () => game.left())
  $('br').addEventListener('click', () => game.right())
  $('bj').addEventListener('click', () => game.jump())

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase()
    if (['arrowleft', 'a'].includes(k)) { game.left(); e.preventDefault() }
    else if (['arrowright', 'd'].includes(k)) { game.right(); e.preventDefault() }
    else if (['arrowup', 'w', ' '].includes(k)) {
      if (game.getMode() !== 'playing') { if (k === ' ' || k === 'enter') game.start() } else game.jump()
      e.preventDefault()
    } else if (k === 'enter' && game.getMode() !== 'playing') game.start()
  })

  // Gestos: deslizar para os lados ou para cima
  let t0 = null
  const canvas = $('canvas')
  canvas.addEventListener('pointerdown', (e) => { t0 = { x: e.clientX, y: e.clientY } })
  canvas.addEventListener('pointerup', (e) => {
    if (!t0) return
    const dx = e.clientX - t0.x
    const dy = e.clientY - t0.y
    t0 = null
    if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) (dx > 0 ? game.right : game.left)()
    else if (dy < -30) game.jump()
  })
}
