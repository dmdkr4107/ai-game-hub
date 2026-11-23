import {useLayoutEffect, useRef} from 'react';

const width = 480;
const height = 280;
const pixelRatio = 2;
const moon = '#e5d5ff';
const mint = '#86e3c5';
const gold = '#f9cf83';

type Point = readonly [number, number];

function polygon(context: CanvasRenderingContext2D, points: Point[], fill: string) {
  context.beginPath();
  points.forEach(([x,y], index) => {
    if (index === 0) context.moveTo(x,y);
    else context.lineTo(x,y);
  });
  context.closePath();
  context.fillStyle = fill;
  context.fill();
}

function sky(context: CanvasRenderingContext2D) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#11152f');
  gradient.addColorStop(.66, '#352357');
  gradient.addColorStop(1, '#292040');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(379, 64, 10, 379, 64, 88);
  glow.addColorStop(0, '#aa80ee6b');
  glow.addColorStop(1, '#aa80ee00');
  context.fillStyle = glow;
  context.fillRect(290, 0, 178, 152);
  context.fillStyle = moon;
  context.beginPath();
  context.arc(379, 64, 28, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#c5b5eb';
  for (const [x,y] of [[26,45],[74,25],[103,58],[138,39],[166,71],[203,28],[261,52],[300,29],[320,75],[417,29],[460,62]]) {
    context.fillRect(x,y,2,2);
  }
  polygon(context, [[0,134],[45,107],[74,117],[120,89],[159,123],[195,101],[235,128],[301,102],[349,124],[413,109],[480,132],[480,177],[0,177]], '#272346');
  polygon(context, [[0,153],[56,124],[114,145],[165,128],[193,148],[269,128],[319,147],[379,128],[440,150],[480,141],[480,196],[0,196]], '#1c203a');
}

function diamond(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  polygon(context, [[x,y-radius],[x+radius*.7,y],[x,y+radius],[x-radius*.7,y]], gold);
  polygon(context, [[x,y-radius],[x,y+radius],[x-radius*.7,y]], '#fff2b7');
}

function drawSideScene(context: CanvasRenderingContext2D) {
  sky(context);
  context.fillStyle = '#171b2f';
  context.fillRect(0, 203, width, 77);

  // The side camera keeps every tile and the character at the same scale.
  const ledges = [[0,228,143],[167,200,73],[264,173,72],[363,146,117]];
  for (const [x,y,w] of ledges) {
    context.fillStyle = '#31395b';
    context.fillRect(x, y, w, 25);
    context.fillStyle = '#3e766f';
    context.fillRect(x, y, w, 8);
    context.fillStyle = mint;
    context.fillRect(x, y, w, 4);
    context.fillStyle = '#48496a';
    for (let tile = x + 5; tile < x + w - 5; tile += 16) context.fillRect(tile, y + 13, 1, 8);
  }

  context.strokeStyle = '#dbc0fdba';
  context.lineWidth = 2;
  context.setLineDash([3,6]);
  context.beginPath();
  context.moveTo(112,200);
  context.quadraticCurveTo(149,148,182,173);
  context.moveTo(229,173);
  context.quadraticCurveTo(255,134,282,146);
  context.moveTo(326,146);
  context.quadraticCurveTo(351,107,380,119);
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = '#5b9a91';
  context.fillRect(66, 218, 9, 10);
  context.fillRect(83, 218, 9, 10);
  context.fillStyle = '#b5f3da';
  context.fillRect(65, 198, 28, 21);
  context.fillRect(62, 180, 34, 18);
  context.fillStyle = '#547d87';
  context.fillRect(62, 194, 34, 4);
  context.fillStyle = '#263251';
  context.fillRect(80, 185, 16, 8);
  context.fillStyle = '#e7fff0';
  context.fillRect(88, 187, 4, 3);
  for (const [x,y] of [[192,161],[295,134],[404,108]]) diamond(context,x,y,8);
}

function project(x: number, y: number, depth: number): Point {
  const scale = 255 / (depth + 3.7);
  return [240 + x * scale, 88 + (2.6 - y) * scale];
}

type Box = {
  left: number;
  right: number;
  near: number;
  far: number;
  bottom: number;
  top: number;
};

function drawBox(context: CanvasRenderingContext2D, box: Box, colors: readonly [string,string,string]) {
  const {left,right,near,far,bottom,top} = box;
  const leftFront = project(left,top,near);
  const rightFront = project(right,top,near);
  const leftBack = project(left,top,far);
  const rightBack = project(right,top,far);
  polygon(context, [leftFront,rightFront,project(right,bottom,near),project(left,bottom,near)], colors[1]);
  if (left >= 0) {
    polygon(context, [leftBack,leftFront,project(left,bottom,near),project(left,bottom,far)], colors[2]);
  } else if (right <= 0) {
    polygon(context, [rightFront,rightBack,project(right,bottom,far),project(right,bottom,near)], colors[2]);
  }
  polygon(context, [leftBack,rightBack,rightFront,leftFront], colors[0]);
}

function drawPerspectiveScene(context: CanvasRenderingContext2D) {
  sky(context);

  // Parallel ground lines converge at the horizon as their Z depth increases.
  const ground = context.createLinearGradient(0, 105, 0, height);
  ground.addColorStop(0, '#242344');
  ground.addColorStop(1, '#152237');
  context.fillStyle = ground;
  context.fillRect(0, 107, width, height - 107);
  context.lineWidth = 1;
  context.strokeStyle = '#7783ad50';
  context.beginPath();
  for (let x = -11; x <= 11; x += 1) {
    context.moveTo(...project(x,-.65,40));
    context.lineTo(...project(x,-.65,.05));
  }
  for (const z of [.25,.8,1.55,2.55,3.9,5.7,8.1,11.3,15.6,21.3,29,40]) {
    context.moveTo(...project(-14,-.65,z));
    context.lineTo(...project(14,-.65,z));
  }
  context.stroke();

  const platforms: Box[] = [
    {left:2.3,right:4.8,near:9.7,far:11.7,bottom:-.38,top:.22},
    {left:1.22,right:3.6,near:6.7,far:8.35,bottom:-.4,top:.15},
    {left:.24,right:2.62,near:3.8,far:5.25,bottom:-.35,top:.09},
    {left:-3,right:.45,near:.45,far:2.55,bottom:-.38,top:0},
  ];
  platforms.forEach((platform,index) => {
    drawBox(context, platform, ['#73c2b4','#344160','#4d948f']);
    const {left,right,near,far,top} = platform;
    context.strokeStyle = mint;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(...project(left,top,near));
    context.lineTo(...project(right,top,near));
    context.stroke();
    if (index < 3) {
      const depth = (near + far) * .5;
      const [x,y] = project((left+right)*.5, top+.62, depth);
      diamond(context,x,y,144/(depth+3.7)*.44);
    }
  });

  const robot = {left:-1.18,right:-.5,near:1.15,far:1.63,bottom:.13,top:.59};
  drawBox(context, {...robot,left:-1.13,right:-.97,bottom:0,top:.16}, ['#97d4be','#55998d','#427c82']);
  drawBox(context, {...robot,left:-.72,right:-.56,bottom:0,top:.16}, ['#97d4be','#55998d','#427c82']);
  drawBox(context, robot, ['#d6ffe7','#a2e4ca','#6eb3a8']);
  drawBox(context, {left:-1.23,right:-.43,near:1.12,far:1.62,bottom:.6,top:.98}, ['#e3fff3','#a7ead6','#79bbb1']);
  polygon(context, [
    project(-1.18,.89,1.12), project(-.51,.89,1.12),
    project(-.51,.7,1.12), project(-1.18,.7,1.12),
  ], '#273453');
  for (const x of [-1.05,-.68]) {
    const [screenX,screenY] = project(x,.81,1.12);
    context.fillStyle = '#eefff5';
    context.fillRect(screenX-1.5,screenY-1.8,3,3.6);
  }
}

export default function ScenePreview({mode,label}:{mode:'2d'|'3d';label:string}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.setTransform(pixelRatio,0,0,pixelRatio,0,0);
    if (mode === '2d') drawSideScene(context);
    else drawPerspectiveScene(context);
  }, [mode]);

  return <canvas
    ref={canvas}
    className="scene-preview"
    data-preview-mode={mode}
    width={width*pixelRatio}
    height={height*pixelRatio}
    role="img"
    aria-label={label}
  />;
}
