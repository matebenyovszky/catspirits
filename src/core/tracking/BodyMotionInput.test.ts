import { describe, expect, it } from "vitest";
import { BodyMotionInput } from "./BodyMotionInput";
import type { PoseFrame, PoseLandmark } from "./types";

function standing(timestampMs: number, scale = 1): PoseFrame {
  const landmarks: PoseLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  const positions: Record<number, [number, number]> = {
    0: [0.5, 0.1], 11: [0.4, 0.24], 12: [0.6, 0.24],
    23: [0.44, 0.5], 24: [0.56, 0.5], 25: [0.44, 0.68], 26: [0.56, 0.68],
    27: [0.44, 0.86], 28: [0.56, 0.86],
  };
  for (const [index, [x, y]] of Object.entries(positions)) {
    landmarks[Number(index)] = { x: 0.5 + (x - 0.5) * scale, y: 0.5 + (y - 0.5) * scale, z: 0, visibility: 0.99 };
  }
  return { timestampMs, landmarks, worldLandmarks: [], inferenceMs: 5 };
}

function calibrate(input: BodyMotionInput, scale = 1, start = 0) {
  let result = input.update(standing(start, scale));
  for (let timestamp = start + 50; timestamp <= start + 1500; timestamp += 50) {
    result = input.update(standing(timestamp, scale));
  }
  expect(result.calibrated).toBe(true);
  return start + 1500;
}

function rise(frame: PoseFrame, displacement: number) {
  frame.landmarks.forEach((point) => { point.y -= displacement; });
  return frame;
}

function liftKnee(frame: PoseFrame, side: number, scale = 1) {
  frame.landmarks[25 + side].y -= 0.1 * scale;
  frame.landmarks[27 + side].y -= 0.1 * scale;
  return frame;
}

describe("BodyMotionInput", () => {
  it("calibrates from torso samples despite a small framing shift and keeps a stationary player idle", () => {
    const input = new BodyMotionInput();
    expect(input.update(standing(0))).toMatchObject({ tracked: true, calibrated: false, calibrationProgress: 0 });
    for (let timestamp = 100; timestamp <= 1000; timestamp += 100) input.update(standing(timestamp));
    const shifted = standing(1100);
    shifted.landmarks.forEach((point) => { point.x += 0.03; });
    expect(input.update(shifted).calibrated).toBe(true);
    input.reset();
    calibrate(input);
    expect(input.update(standing(1550))).toMatchObject({ tracked: true, calibrated: true, runSpeed: 0, jump: false, crouch: false, lane: 0 });
  });

  it("rejects a deep squat or uncertain torso but does not require every ankle", () => {
    const input = new BodyMotionInput();
    for (let timestamp = 0; timestamp < 2000; timestamp += 50) {
      const bent = standing(timestamp);
      bent.landmarks[25].x -= 0.13;
      bent.landmarks[26].x += 0.13;
      expect(input.update(bent).calibrated).toBe(false);
    }
    const cropped = standing(2050);
    cropped.landmarks[27].y = 1.02;
    expect(input.update(cropped)).toMatchObject({ tracked: true, calibrated: false });
    const uncertain = standing(2100);
    uncertain.landmarks[23].visibility = 0.3;
    expect(input.update(uncertain).tracked).toBe(false);
  });

  it.each([1, 0.65])("detects one jump per airborne cycle at body scale %s", (scale) => {
    const input = new BodyMotionInput();
    calibrate(input, scale);
    expect(input.update(rise(standing(1550, scale), 0.08 * scale)).jump).toBe(true);
    for (let timestamp = 1600; timestamp <= 2300; timestamp += 50) {
      expect(input.update(rise(standing(timestamp, scale), 0.08 * scale)).jump).toBe(false);
    }
    expect(input.update(standing(2350, scale)).jump).toBe(false);
    expect(input.update(rise(standing(2400, scale), 0.08 * scale)).jump).toBe(true);
  });

  it("suppresses floor jitter, single-foot lifts, squats and rapid repeat jumps", () => {
    const input = new BodyMotionInput();
    calibrate(input);
    expect(input.update(rise(standing(1550), 0.01)).jump).toBe(false);
    expect(input.update(liftKnee(standing(1600), 0)).jump).toBe(false);
    const squat = standing(1650);
    for (const index of [0, 11, 12, 23, 24]) squat.landmarks[index].y += 0.09;
    expect(input.update(squat)).toMatchObject({ jump: false, crouch: true });
    // Hip motion alone, including straightening after a squat, is insufficient.
    const hipsUp = standing(1700);
    for (const index of [23, 24]) hipsUp.landmarks[index].y -= 0.04;
    expect(input.update(hipsUp).jump).toBe(false);
    expect(input.update(rise(standing(1750), 0.08)).jump).toBe(true);
    input.update(standing(1800));
    expect(input.update(rise(standing(1850), 0.08)).jump).toBe(false);
    for (let timestamp = 1900; timestamp <= 2600; timestamp += 50) {
      expect(input.update(rise(standing(timestamp), 0.08)).jump).toBe(false);
    }
  });

  it.each([1, 0.65])("uses alternating knee lifts to run and decays when motion stops at scale %s", (scale) => {
    const input = new BodyMotionInput();
    calibrate(input, scale);
    expect(input.update(liftKnee(standing(1550, scale), 0, scale)).runSpeed).toBe(0);
    for (let timestamp = 1600; timestamp < 1950; timestamp += 50) input.update(standing(timestamp, scale));
    const running = input.update(liftKnee(standing(1950, scale), 1, scale));
    expect(running.cadenceSpm).toBeCloseTo(150);
    expect(running.runSpeed).toBeGreaterThan(0.2); // acceleration is time-based, not a one-frame snap
    expect(running.jump).toBe(false);
    let stopped = running;
    for (let timestamp = 2000; timestamp <= 5450; timestamp += 50) stopped = input.update(standing(timestamp, scale));
    expect(stopped.runSpeed).toBe(0);
  });

  it("does not run from repeated lifts of only one knee", () => {
    const input = new BodyMotionInput();
    calibrate(input);
    for (let timestamp = 1550; timestamp < 4000; timestamp += 100) {
      const frame = standing(timestamp);
      expect(input.update(timestamp % 200 === 150 ? liftKnee(frame, 0) : frame).runSpeed).toBe(0);
    }
  });

  it("calibrates at 5 FPS and tolerates a cropped face during a small jump", () => {
    const input = new BodyMotionInput();
    for (let t = 0; t <= 1400; t += 200) {
      const frame = standing(t);
      frame.landmarks[0].visibility = 0;
      const result = input.update(frame);
      if (t === 1400) expect(result.calibrated).toBe(true);
    }
    const frame = rise(standing(1600), 0.036); // only 10% of leg length
    frame.landmarks[0].y = -0.03;
    frame.landmarks[0].visibility = 0;
    expect(input.update(frame)).toMatchObject({ calibrated: true, jump: true });
  });

  it("retains calibration through brief occlusion but never jumps on reacquisition", () => {
    const input = new BodyMotionInput();
    calibrate(input);
    const hidden = standing(1550);
    hidden.landmarks[23].visibility = 0; // core loss, not merely an occluded foot
    expect(input.update(hidden)).toMatchObject({ tracked: false, calibrated: true, jump: false, runSpeed: 0 });
    expect(input.update(rise(standing(1650), 0.08))).toMatchObject({ calibrated: true, jump: false });
    input.update(standing(1700));
    expect(input.update(rise(standing(1750), 0.08)).jump).toBe(true);
    hidden.timestampMs = 2500;
    expect(input.update(hidden).calibrated).toBe(false);
  });

  it.each([60, 120, 180, 240])("maps %s alternating foot lifts/minute proportionally to speed", (cadence) => {
    const input = new BodyMotionInput();
    calibrate(input);
    const interval = 60000 / cadence;
    let output = input.update(standing(1550));
    for (let t = 1600; t <= 11600; t += 50) {
      const frame = standing(t);
      const phase = (t - 1600) % interval;
      const side = Math.floor((t - 1600) / interval) % 2;
      // Ankle/foot lift alone also works; knees remain at the baseline.
      if (phase < interval * 0.4) frame.landmarks[27 + side].y -= 0.06;
      output = input.update(frame);
      expect(output.jump).toBe(false);
    }
    expect(output.cadenceSpm).toBeCloseTo(cadence);
    expect(output.runSpeed).toBeCloseTo(cadence / 240, 2);
  });

  it("keeps the take-off running pace while leg contacts are unavailable in the air", () => {
    const input = new BodyMotionInput();
    calibrate(input);
    let output = input.update(standing(1550));
    for (let t = 1600; t <= 4000; t += 50) {
      const frame = standing(t), interval = 400;
      const phase = (t - 1600) % interval;
      if (phase < 150) frame.landmarks[27 + Math.floor((t - 1600) / interval) % 2].y -= .06;
      output = input.update(frame);
    }
    expect(output.runSpeed).toBeGreaterThan(.5);
    const takeoffPace = output.runSpeed;
    output = input.update(rise(standing(4050), .08));
    expect(output).toMatchObject({ jump: true });
    expect(output.runSpeed).toBeCloseTo(takeoffPace, 6);
    for (let t = 4100; t <= 4550; t += 50) {
      output = input.update(rise(standing(t), .08));
      expect(output.jump).toBe(false);
      expect(output.runSpeed).toBeCloseTo(takeoffPace, 6);
    }
  });

  it("reports a stronger jump for a higher and faster coherent take-off", () => {
    const strength = (displacement: number) => {
      const input = new BodyMotionInput();
      calibrate(input);
      const output = input.update(rise(standing(1550), displacement));
      expect(output.jump).toBe(true);
      return output.jumpStrength ?? 0;
    };
    const small = strength(.036), large = strength(.1);
    expect(small).toBeGreaterThanOrEqual(.2);
    expect(large).toBeGreaterThan(small + .25);
  });

  it("does not accelerate from simultaneous foot lifts or whole-body bobbing", () => {
    const input = new BodyMotionInput();
    calibrate(input);
    for (let t = 1550; t < 4000; t += 50) {
      const frame = rise(standing(t), Math.sin(t / 200) * 0.01);
      if (t % 400 < 200) {
        frame.landmarks[27].y -= 0.08;
        frame.landmarks[28].y -= 0.08;
      }
      expect(input.update(frame)).toMatchObject({ runSpeed: 0, jump: false });
    }
  });

  it("counts small alternating ankle raises without requiring high knees", () => {
    const input = new BodyMotionInput();
    calibrate(input);
    for (let t = 1550; t <= 2550; t += 50) {
      const frame = standing(t);
      const phase = (t - 1550) % 500;
      if (phase < 150) frame.landmarks[27 + Math.floor((t - 1550) / 500) % 2].y -= 0.028;
      const output = input.update(frame);
      if (t === 2550) expect(output.cadenceSpm).toBe(120);
      expect(output.jump).toBe(false);
    }
  });

  it("maps horizontal movement to a bounded mirrored lane", () => {
    const input = new BodyMotionInput();
    calibrate(input);
    let result = input.update(standing(1550));
    for (let timestamp = 1600; timestamp <= 2100; timestamp += 50) {
      const frame = standing(timestamp);
      frame.landmarks.forEach((point) => { point.x -= 0.25; });
      result = input.update(frame);
    }
    expect(result.lane).toBeGreaterThan(0.99);
    expect(result.lane).toBeLessThanOrEqual(1);
  });

  it("clears calibration and pending events after loss or a long frame gap", () => {
    const input = new BodyMotionInput();
    calibrate(input);
    input.update(liftKnee(standing(1550), 0));
    expect(input.lost()).toEqual({ tracked: false, calibrated: false, calibrationProgress: 0, runSpeed: 0, jump: false, crouch: false, lane: 0 });
    expect(input.update(rise(standing(1600), 0.08))).toMatchObject({ calibrated: false, runSpeed: 0, jump: false });
    calibrate(input, 1, 1650);
    expect(input.update(rise(standing(4000), 0.08))).toMatchObject({ calibrated: false, runSpeed: 0, jump: false });
    input.reset();
    expect(input.update(standing(5000)).calibrationProgress).toBe(0);
  });

  it("does not mistake the observed camera framing change for crouching", () => {
    const input = new BodyMotionInput();
    const reference = (t: number) => {
      const frame = standing(t);
      for (const i of [11, 12]) frame.landmarks[i].y = 0.12523;
      for (const i of [23, 24]) frame.landmarks[i].y = 0.31426;
      for (const i of [25, 26]) frame.landmarks[i].y = 0.466;
      for (const i of [27, 28]) frame.landmarks[i].y = 0.6011;
      return frame;
    };
    for (let t = 0; t <= 1500; t += 50) input.update(reference(t));
    const frame = standing(1550);
    const observed: Record<number, [number, number]> = {
      11: [.40227, .19744], 12: [.41483, .20247], 23: [.39530, .41584], 24: [.41213, .41640],
      25: [.39504, .57319], 26: [.42932, .58770], 27: [.38209, .71799], 28: [.43637, .75522],
    };
    for (const [key, [x, y]] of Object.entries(observed)) Object.assign(frame.landmarks[+key], { x, y });
    expect(input.update(frame)).toMatchObject({ tracked: true, calibrated: true, crouch: false, jump: false });
  });

  it("runs from alternating bent knees without ankles or a return to straight standing", () => {
    const input = new BodyMotionInput();
    const frameAt = (t: number) => {
      const frame = standing(t);
      frame.landmarks[27].visibility = frame.landmarks[28].visibility = 0;
      return frame;
    };
    for (let t = 0; t <= 1500; t += 50) input.update(frameAt(t));
    let output = input.update(frameAt(1550));
    for (let t = 1600; t <= 4000; t += 50) {
      const frame = frameAt(t), side = Math.floor((t - 1600) / 400) % 2;
      frame.landmarks[25].y -= .05;
      frame.landmarks[26].y -= .05;
      frame.landmarks[25 + side].y -= .04;
      output = input.update(frame);
      expect(output.crouch).toBe(false);
      expect(output.jump).toBe(false);
    }
    expect(output).toMatchObject({ calibrated: true, tracked: true, runAvailable: true });
    expect(output.runSpeed).toBeGreaterThan(.6);
    expect(input.diagnostics().steps).toBeGreaterThan(5);
  });

  it.each([false, true])("detects coherent shoulder/hip takeoff with missing feet: initially cropped=%s", (initiallyCropped) => {
    const input = new BodyMotionInput();
    const frameAt = (t: number, crop: boolean) => {
      const frame = standing(t);
      if (crop) for (const i of [25, 26, 27, 28]) frame.landmarks[i].visibility = 0;
      return frame;
    };
    for (let t = 0; t <= 1500; t += 50) input.update(frameAt(t, initiallyCropped));
    const frame = frameAt(1550, true);
    for (const i of [11, 12, 23, 24]) frame.landmarks[i].y -= .055;
    expect(input.update(frame)).toMatchObject({ jump: true, tracked: true, calibrated: true, runAvailable: false });
    expect(input.diagnostics().jumpSource).toBe("torso");
  });

  it("rejects shoulder shrugs, gradual upward repositioning and standing up from a squat", () => {
    const input = new BodyMotionInput();
    calibrate(input);
    const shrug = standing(1550);
    shrug.landmarks[11].y -= .06; shrug.landmarks[12].y -= .06;
    expect(input.update(shrug).jump).toBe(false);
    for (let t = 1600; t <= 3500; t += 50) {
      const frame = rise(standing(t), (t - 1600) / 1900 * .08);
      expect(input.update(frame).jump).toBe(false);
    }
    input.reset(); calibrate(input);
    for (let t = 1550; t <= 2000; t += 50) {
      const squat = standing(t);
      for (const i of [11, 12, 23, 24]) squat.landmarks[i].y += .09;
      expect(input.update(squat)).toMatchObject({ jump: false, crouch: true });
    }
    expect(input.update(standing(2050)).jump).toBe(false);
  });

  it('responds to a coherent take-off earlier in the quick arcade profile',()=>{
    const onset=(response:'standard'|'quick')=>{
      const input=new BodyMotionInput(response);calibrate(input);
      input.update(standing(1520));
      for(let elapsed=20;elapsed<=200;elapsed+=20){
        if(input.update(rise(standing(1520+elapsed),elapsed*.00055)).jump)return elapsed;
      }
      throw new Error('Take-off was not detected');
    };
    expect(onset('quick')).toBeLessThan(onset('standard'));
  });
  it('reduces lane smoothing delay in the quick profile',()=>{
    const lane=(response:'standard'|'quick')=>{
      const input=new BodyMotionInput(response);calibrate(input);
      const frame=standing(1550);frame.landmarks.forEach(p=>p.x-=.15);
      return input.update(frame).lane;
    };
    expect(lane('quick')).toBeGreaterThan(lane('standard')*1.5);
  });
  it.each(['standard','quick'] as const)('still detects a small hop at 5 FPS in the %s profile',response=>{
    const input=new BodyMotionInput(response);
    for(let t=0;t<=1400;t+=200)input.update(standing(t));
    expect(input.update(rise(standing(1600),.036)).jump).toBe(true);
  });
  it.each(['standard','quick'] as const)('keeps jitter, scale changes, occlusion and repeat events out of the %s profile',response=>{
    const input=new BodyMotionInput(response);calibrate(input);
    for(let t=1520;t<=2000;t+=20)expect(input.update(rise(standing(t),Math.sin(t/40)*.01)).jump).toBe(false);
    const shrug=standing(2020);shrug.landmarks[11].y-=.06;shrug.landmarks[12].y-=.06;
    expect(input.update(shrug).jump).toBe(false);
    expect(input.update(liftKnee(standing(2040),0)).jump).toBe(false);
    expect(input.update(rise(standing(2060,1.3),.08)).jump).toBe(false);
    const hidden=standing(2080);hidden.landmarks[23].visibility=0;
    expect(input.update(hidden).jump).toBe(false);
    expect(input.update(rise(standing(2100),.08)).jump).toBe(false);
    input.reset();calibrate(input);
    expect(input.update(rise(standing(1550),.08)).jump).toBe(true);
    for(let t=1570;t<=2000;t+=20)expect(input.update(rise(standing(t),.08)).jump).toBe(false);
  });
  it.each(['standard','quick'] as const)('recognizes and holds a torso-only bend in the %s arcade mode, then stands without jumping',response=>{
    const input=new BodyMotionInput(response,'torso');
    const frameAt=(t:number,bent=false)=>{
      const frame=standing(t);
      for(const index of [25,26,27,28])frame.landmarks[index].visibility=0;
      if(bent){for(const index of [11,12])frame.landmarks[index].y=.38;for(const index of [23,24])frame.landmarks[index].y=.51;}
      return frame;
    };
    for(let t=0;t<=1500;t+=50)input.update(frameAt(t));
    for(let t=1550;t<=2550;t+=50)expect(input.update(frameAt(t,true))).toMatchObject({crouch:true,jump:false,tracked:true,calibrated:true});
    expect(input.update(frameAt(2600))).toMatchObject({crouch:false,jump:false});
  });
  it.each([.65,.85,1.15,1.35])('does not interpret moving toward/away from the camera as a torso duck at scale %s',scale=>{
    const input=new BodyMotionInput('quick','torso');calibrate(input);
    const frame=standing(1550,scale);for(const index of [25,26,27,28])frame.landmarks[index].visibility=0;
    expect(input.update(frame)).toMatchObject({crouch:false,jump:false,tracked:true,calibrated:true});
  });
  it('supports a lowered squat without feet in arcade mode while preserving the ordinary runner defaults',()=>{
    for(const mode of ['legs','torso'] as const){
      const input=new BodyMotionInput('standard',mode);calibrate(input);
      const frame=rise(standing(1550),-.09);
      for(const index of [25,26,27,28])frame.landmarks[index].visibility=0;
      expect(input.update(frame)).toMatchObject({crouch:mode==='torso',jump:false});
    }
  });
});
