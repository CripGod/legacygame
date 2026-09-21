import { CardFace } from './CardFace';
import type { TutFigureKind } from '../tutorial';

/**
 * A small picture for a tutorial lesson, drawn from the real parts so it looks like what is on the board: a card with
 * its cost circle ringed, a Location's Influence bar with both ends ringed, the Stand banner.
 */
export function TutFigure({ kind, cardId }: { kind: TutFigureKind; cardId?: string }) {
  if (kind === 'cost') {
    return (
      <div className="tut-fig" aria-hidden>
        <div className="tut-fig-card">
          <CardFace id={cardId ?? 'harriet_tubman'} />
          <span className="tut-ring cost" />
        </div>
        <div className="tut-fig-cap">The green circle, upper left: what the card costs</div>
      </div>
    );
  }
  if (kind === 'bar') {
    return (
      <div className="tut-fig" aria-hidden>
        <div className="tut-fig-bar">
          <span className="tut-fig-end mine">3<i className="tut-ring end" /></span>
          <span className="tut-fig-track"><i style={{ width: '75%' }} /><b /></span>
          <span className="tut-fig-end theirs">1<i className="tut-ring end" /></span>
        </div>
        <div className="tut-fig-cap">Gold, left: your Influence. Blue, right: Harborlight's.</div>
      </div>
    );
  }
  return (
    <div className="tut-fig" aria-hidden>
      <div className="tut-fig-stand">
        <span className="sob sob-static" aria-hidden>
          <i className="sob-l sob-l-default" />
          <i className="sob-word" />
        </span>
        <i className="tut-ring wide" />
      </div>
      <div className="tut-fig-cap">The round button at the top centre of the screen</div>
    </div>
  );
}
