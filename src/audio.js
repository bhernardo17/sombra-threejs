// Áudio 100% sintetizado: sem arquivos. Vento, drone grave, passos, sussurros e relíquias.
export function createAudio() {
  let ctx = null
  let master = null
  let muted = false
  let humGain = null
  let humOsc = null
  let whisperGain = null
  let noiseBuf = null

  const makeNoise = () => {
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i += 1) {
      const w = Math.random() * 2 - 1
      last = (last + 0.02 * w) / 1.02 // ruído marrom
      d[i] = last * 3.5
    }
    return buf
  }
  const noiseSource = () => {
    const s = ctx.createBufferSource()
    s.buffer = noiseBuf
    s.loop = true
    return s
  }

  const start = () => {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.8
    master.connect(ctx.destination)
    noiseBuf = makeNoise()

    // Vento
    const wind = noiseSource()
    const windLP = ctx.createBiquadFilter()
    windLP.type = 'lowpass'
    windLP.frequency.value = 500
    const windGain = ctx.createGain()
    windGain.gain.value = 0.22
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.07
    const lfoAmt = ctx.createGain()
    lfoAmt.gain.value = 0.12
    lfo.connect(lfoAmt).connect(windGain.gain)
    wind.connect(windLP).connect(windGain).connect(master)
    wind.start()
    lfo.start()

    // Drone
    const droneLP = ctx.createBiquadFilter()
    droneLP.type = 'lowpass'
    droneLP.frequency.value = 220
    const droneGain = ctx.createGain()
    droneGain.gain.value = 0.07
    ;[55, 55.6, 82.4].forEach((f) => {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.connect(droneLP)
      o.start()
    })
    droneLP.connect(droneGain).connect(master)

    // Zumbido da relíquia mais próxima
    humOsc = ctx.createOscillator()
    humOsc.type = 'sine'
    humOsc.frequency.value = 330
    humGain = ctx.createGain()
    humGain.gain.value = 0
    humOsc.connect(humGain).connect(master)
    humOsc.start()

    // Sussurros das sombras
    const wh = noiseSource()
    const whBP = ctx.createBiquadFilter()
    whBP.type = 'bandpass'
    whBP.frequency.value = 1400
    whBP.Q.value = 3
    whisperGain = ctx.createGain()
    whisperGain.gain.value = 0
    const wlfo = ctx.createOscillator()
    wlfo.frequency.value = 5
    const wamt = ctx.createGain()
    wamt.gain.value = 0.02
    wlfo.connect(wamt).connect(whisperGain.gain)
    wh.connect(whBP).connect(whisperGain).connect(master)
    wh.start()
    wlfo.start()
  }

  const burst = (freq, dur, gain, type = 'bandpass', q = 1) => {
    if (!ctx) return
    const s = noiseSource()
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    const t = ctx.currentTime
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(f).connect(g).connect(master)
    s.start(t, Math.random())
    s.stop(t + dur + 0.05)
  }

  const tone = (freq, dur, gain, type = 'triangle', delay = 0, slideTo) => {
    if (!ctx) return
    const o = ctx.createOscillator()
    o.type = type
    const g = ctx.createGain()
    const t = ctx.currentTime + delay
    o.frequency.setValueAtTime(freq, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(master)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  return {
    start,
    step: (sprint) => burst(sprint ? 520 : 380, 0.09, sprint ? 0.12 : 0.08, 'bandpass', 0.8),
    relic: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 1.4, 0.12, 'triangle', i * 0.11)),
    hurt: () => { tone(90, 0.5, 0.35, 'sine', 0, 40); burst(200, 0.35, 0.3, 'lowpass') },
    flare: () => { tone(300, 0.6, 0.12, 'sawtooth', 0, 1200); burst(2500, 0.5, 0.1, 'highpass') },
    owl: () => { tone(420, 0.45, 0.05, 'sine', 0, 340); tone(420, 0.55, 0.05, 'sine', 0.7, 320) },
    win: () => [392, 494, 587, 784, 988].forEach((f, i) => tone(f, 2.2, 0.1, 'triangle', i * 0.18)),
    lose: () => tone(110, 2.5, 0.25, 'sawtooth', 0, 35),
    setProximity(p) {
      if (!humGain) return
      humGain.gain.setTargetAtTime(p * p * 0.07, ctx.currentTime, 0.2)
      humOsc.frequency.setTargetAtTime(260 + p * 260, ctx.currentTime, 0.2)
    },
    setThreat(p) {
      if (!whisperGain) return
      whisperGain.gain.setTargetAtTime(p * 0.18, ctx.currentTime, 0.15)
    },
    setMuted(m) {
      muted = m
      if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05)
    },
    isMuted: () => muted,
    suspend: () => ctx?.suspend(),
    resume: () => ctx?.resume(),
  }
}
