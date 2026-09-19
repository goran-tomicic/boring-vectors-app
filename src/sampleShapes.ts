export interface SampleShape {
  name: string
  svg: string
}

export const SAMPLE_SHAPES: SampleShape[] = [
  {
    name: 'Star',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 5 L61 35 L95 35 L68 55 L79 90 L50 70 L21 90 L32 55 L5 35 L39 35 Z" fill="#c084fc"/></svg>',
  },
  {
    name: 'Wave',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><path d="M0 30 C 15 5, 35 5, 50 30 C 65 55, 85 55, 100 30 L 100 60 L 0 60 Z" fill="#47bfff"/></svg>',
  },
  {
    name: 'Blob',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M60 10 C90 10 100 40 90 60 C100 90 60 100 40 90 C10 90 0 60 10 40 C0 10 30 0 60 10 Z" fill="#7e14ff"/></svg>',
  },
  {
    name: 'Arrow',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 45 L60 45 L60 25 L90 50 L60 75 L60 55 L10 55 Z" fill="#ff9f4a"/></svg>',
  },
  {
    name: 'Heart',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 85 C10 60 10 25 30 15 C45 8 50 25 50 25 C50 25 55 8 70 15 C90 25 90 60 50 85 Z" fill="#ff5c8a"/></svg>',
  },
]
