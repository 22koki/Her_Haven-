export const CIRCLES = [
  { id: 'everyday', title: 'A little off my chest', category: 'EVERYDAY LIFE', description: 'The big feelings. The little things. A place to put them down.', icon: 'HeartHandshake', color: 'rose', prompt: 'What has been on your mind lately?' },
  { id: 'friendship', title: 'Finding our people', category: 'FRIENDSHIP & JOY', description: 'Good conversations and the beginnings of new friendships.', icon: 'UsersRound', color: 'sage', prompt: 'What would you love to do with a new friend?' },
  { id: 'growth', title: 'Growing, together', category: 'WORK & MONEY', description: 'Small steps, big dreams, and figuring things out along the way.', icon: 'Sprout', color: 'ochre', prompt: 'What is one thing you would like help moving forward?' },
  { id: 'wellbeing', title: 'In my own skin', category: 'BODY & BEAUTY', description: 'Caring for yourself, asking questions, and expressing your style.', icon: 'Flower2', color: 'lilac', prompt: 'What does caring for yourself look like this week?' },
  { id: 'creativity', title: 'Made of little joys', category: 'CREATIVITY', description: 'Books, recipes, half-finished hobbies, and things that make us smile.', icon: 'Palette', color: 'peach', prompt: 'What have you been making, reading, or enjoying?' },
  { id: 'starting-over', title: 'A new chapter', category: 'STARTING OVER', description: 'Finding your feet when life looks different from what you imagined.', icon: 'Sunrise', color: 'blue', prompt: 'What would make this new chapter a little easier?' },
] as const;

export const RESPONSE_OPTIONS = [
  { id: 'listen', label: 'Just listen', icon: 'Heart', detail: 'Understanding, without advice.' },
  { id: 'advice', label: 'Ideas welcome', icon: 'Lightbulb', detail: 'Thoughtful suggestions are welcome.' },
  { id: 'practical', label: 'Practical help', icon: 'HandHelping', detail: 'Help with a specific next step.' },
  { id: 'experience', label: 'Anyone else?', icon: 'MessagesSquare', detail: 'Share your experience, if you want to.' },
  { id: 'celebrate', label: 'Celebrate with me', icon: 'Sparkles', detail: 'A little moment worth celebrating.' },
  { id: 'no-replies', label: 'No replies for now', icon: 'Leaf', detail: 'Some space to share quietly.' },
] as const;

export type ViewName = 'home' | 'living' | 'circles' | 'resources' | 'joy' | 'quiet' | 'saved' | 'space' | 'safety';
export interface DisplayPost { id: string; circleId: string; body: string; responsePreference: string; hideProfile: boolean; createdAt: string; author?: string; initial?: string; color?: string; sample?: boolean; title?: string; }

export const SAMPLE_POSTS: DisplayPost[] = [
  { id: 'demo-small-step', circleId: 'growth', author: 'Amara', initial: 'A', color: 'ochre', responsePreference: 'celebrate', hideProfile: false, createdAt: '', sample: true, title: 'A small step that feels like a big one.', body: 'I finally sent the application I kept talking myself out of. No idea what happens next, but today I am choosing to be proud of trying. What is a little win you are holding onto?' },
  { id: 'demo-whole-self', circleId: 'everyday', author: 'A quiet voice', initial: '🌷', color: 'rose', responsePreference: 'listen', hideProfile: true, createdAt: '', sample: true, title: 'Anyone else tired of having it all together?', body: 'Some days I am the person everyone comes to, and I forget that I am allowed to need support too. Today I just wanted to put that into words. No fixing needed, just a little company.' },
  { id: 'demo-book-club', circleId: 'friendship', author: 'Nia', initial: 'N', color: 'sage', responsePreference: 'experience', hideProfile: false, createdAt: '', sample: true, title: 'Friendship can start with something small.', body: 'My ideal evening: a book, something warm to drink, and a friend who is happy to sit in comfortable silence. What is your kind of low-key hangout?' },
  { id: 'demo-own-style', circleId: 'wellbeing', author: 'Leila', initial: 'L', color: 'lilac', responsePreference: 'advice', hideProfile: false, createdAt: '', sample: true, title: 'Finding little ways to feel like myself.', body: 'I am trying a week of wearing things I already own in new combinations. It is a fun excuse to be creative without shopping. What is a favourite small way you express your style?' },
  { id: 'demo-slow-creative', circleId: 'creativity', author: 'Zuri', initial: 'Z', color: 'peach', responsePreference: 'celebrate', hideProfile: false, createdAt: '', sample: true, title: 'A slightly wonky mug, made with love.', body: 'Tried a pottery workshop and made the least symmetrical mug in the room. I love it. Here is to being beginners and making things just because they make us happy.' },
  { id: 'demo-new-chapter', circleId: 'starting-over', author: 'Maya', initial: 'M', color: 'blue', responsePreference: 'practical', hideProfile: false, createdAt: '', sample: true, title: 'Making a new place feel like home.', body: 'I moved recently and am starting with small routines: a familiar breakfast, a walk, one friendly conversation. What helped you settle into a new chapter?' },
];

export const ARRIVALS = [
  { id: 'listen', label: 'Be heard', description: 'A little off my chest', icon: 'HeartHandshake', color: 'rose', view: 'living' },
  { id: 'company', label: 'Find company', description: 'My kind of people', icon: 'UsersRound', color: 'sage', view: 'circles' },
  { id: 'grow', label: 'Grow a little', description: 'One step at a time', icon: 'Sprout', color: 'ochre', view: 'resources' },
  { id: 'joy', label: 'Feel some joy', description: 'Room for the good stuff', icon: 'Sun', color: 'peach', view: 'joy' },
] as const;
