// Hotspot content + positions.
// Positions are in millimetres on the assembled print, Z-up, origin = table point under the bus.
// (+Y = RTG side is negative: RTG boom points to -Y, science boom to +Y, magnetometer boom rises over -Y.)
// Edit `p` to nudge a button; edit `audio` to point at a different file.

export const MILESTONE_UTC = Date.UTC(2026, 10, 18, 10, 16, 7); // 1 light-day, per NASA via IFLScience
export const LIGHT_DAY_KM = 25.9e9;
export const SPEED_KMS = 17.0; // ~61,000 km/h relative to the Sun
export const REAL_SCALE = 38.7; // print is ~1:38.7 (95.6 mm dish vs 3.7 m)

export const STATUS = {
  on: { label: 'OPERATING', cls: 'on' },
  fading: { label: 'OPERATING · FADING', cls: 'on' },
  off: { label: 'OFF', cls: 'off' },
  info: { label: '', cls: 'info' },
};

export const HOTSPOTS = [
  {
    id: 'mission', short: '1 light-day', title: 'Voyager 1 · One Light-Day', status: 'info', statusText: 'MISSION · SINCE 1977',
    p: [0, 0, 112], parts: [],
    text: 'Launched September 5, 1977. Flew past Jupiter in 1979 and Saturn in 1980, then crossed into interstellar space in 2012. On November 18, 2026 it became the first human-made object one light-day from Earth: a radio signal now takes 24 hours each way.',
    audio: 'audio/00_mission.mp3', live: true,
  },
  {
    id: 'hga', short: 'High-gain antenna', title: 'High-Gain Antenna', status: 'on',
    p: [-40, 18, 85], parts: ['dish'],
    text: 'A 3.7 m dish that has pointed back at Earth for nearly 50 years. Its transmitter runs on about 20 watts, and the signal takes a full day to reach the 70 m dishes of NASA’s Deep Space Network, arriving at roughly 160 bits per second.',
    audio: 'audio/01_hga.mp3',
  },
  {
    id: 'bus', short: 'Bus', title: 'The Bus (Electronics)', status: 'on',
    p: [-14.4, -19.9, 34], parts: ['bus', 'bus_box', 'block_a', 'block_b', 'legs'],
    text: 'The ten-sided body holding the flight computers, radio and attitude-control electronics. Its computers were designed in the early 1970s, and engineers still reprogram them from a light-day away.',
    audio: 'audio/02_bus.mp3',
  },
  {
    id: 'record', short: 'Golden Record', title: 'The Golden Record', status: 'info', statusText: 'MESSAGE TO THE STARS',
    p: [-24.2, 7.9, 30], parts: ['record'],
    text: 'A gold-plated copper record mounted on the bus: images, greetings in 55 languages, sounds of Earth and 90 minutes of music. The cover diagrams explain how to play it and use pulsars to map the way back to our Sun.',
    audio: 'audio/03_record.mp3',
  },
  {
    id: 'rtg', short: 'RTG power', title: 'Radioisotope Power (RTGs)', status: 'fading',
    p: [0, -91, 37], parts: ['rtg', 'rtg_boom'],
    text: 'Three generators turn heat from decaying plutonium-238 into electricity. About 470 watts at launch, now less than half that and dropping about 4 watts a year, which is why instruments are being switched off one by one.',
    audio: 'audio/04_rtg.mp3',
  },
  {
    id: 'mag', short: 'Magnetometer', title: 'Magnetometer (MAG)', status: 'on',
    p: [0, -163.7, 138], parts: ['mag_1', 'mag_2', 'mag_3'],
    text: 'Sensors on a 13 m boom, far from the spacecraft’s own magnetic noise. Still measuring the magnetic field of interstellar space: one of Voyager 1’s two working science instruments.',
    audio: 'audio/05_mag.mp3',
  },
  {
    id: 'pws', short: 'Plasma wave antennas', title: 'Plasma Wave Antennas (PWS)', status: 'on',
    p: [-10, -21, 27], parts: ['whips'],
    text: 'Two 10 m wire antennas (drawn in here; too thin to print) that “listen” to the thin gas between the stars. Their readings helped confirm Voyager 1 had entered interstellar space. The second of its two working science instruments.',
    audio: 'audio/06_pws.mp3',
  },
  {
    id: 'cameras', short: 'Cameras', title: 'Imaging Cameras (Narrow & Wide)', status: 'off', statusText: 'OFF SINCE 1990',
    p: [9, 97, 33], parts: ['sci_a', 'sci_b'],
    text: 'Two cameras on the scan platform. Their last pictures, on February 14, 1990, were the Family Portrait of the planets, including the Pale Blue Dot: Earth from about 6 billion km. They were turned off soon after.',
    audio: 'audio/07_cameras.mp3',
  },
  {
    id: 'crs', short: 'Cosmic rays', title: 'Cosmic Ray Subsystem (CRS)', status: 'off', statusText: 'OFF SINCE 2025',
    p: [3, 70, 59], parts: ['sci_a', 'sci_b'],
    text: 'Measured high-energy particles from the Sun and the galaxy, and helped show when Voyager 1 left the Sun’s bubble, the heliosphere. Switched off in February 2025 to save power.',
    audio: 'audio/08_crs.mp3',
  },
  {
    id: 'lecp', short: 'LECP', title: 'Low-Energy Charged Particles (LECP)', status: 'off', statusText: 'OFF SINCE APRIL 2026',
    p: [4, 58, 40], parts: ['sci_a', 'sci_b'],
    text: 'Ran almost nonstop for 49 years, measuring ions and electrons and tracking pressure fronts in interstellar space. Shut off on April 17, 2026 after power dropped unexpectedly; a small part of it keeps running.',
    audio: 'audio/09_lecp.mp3',
  },
  {
    id: 'retired', short: 'Retired instruments', title: 'Retired Instruments', status: 'off',
    p: [-9, 92, 26], parts: ['sci_a', 'sci_b'],
    text: 'Ultraviolet and infrared spectrometers, photopolarimeter, plasma science and planetary radio astronomy. They studied the atmospheres, moons and rings of Jupiter and Saturn, then were switched off or failed over the decades. Only two of Voyager 1’s ten instruments still collect data.',
    audio: null, // no narration: card is text-only
  },
];

// Extras drawn in code (mm, Z-up)
export const RECORD = { center: [-23.36, 7.59, 30], normal: [-0.951, 0.309, 0], radius: 4.2 };
export const WHIPS = { root: [-10, -21, 27], dirs: [[-0.88, -0.47, -0.08], [-0.47, -0.88, -0.08]], length: 263 };
export const BUS_CENTER = [0, 0, 35];
