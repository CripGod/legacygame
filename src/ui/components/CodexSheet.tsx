import { useState, type ReactNode } from 'react';
import { CARD_BY_ID } from '../../engine';
import { CardFace } from './CardFace';
import { cardName, useDisplay } from '../display';
import { FINISH_LABEL, RANK_LABEL, RANK_PRICE, balance, finishOf, fixedRank, nextRank, promote, rankOf, useLedger } from '../legacy';
import { tip } from '../tip';
import { Stage } from './Stage';
import '../compendium.css';

/**
 * The card, alone, on the dark. "History" slides the card to the left and opens the story beside it,
 * light text on the dark ground, scrolling when it runs long.
 *
 * The same stage serves the match: `children` is an action tray under the card (send it somewhere, enter,
 * relocate, a live readout), so a card reads the same wherever it opens.
 */
export function CodexSheet({ id, label, onClose, children, flat, siblings, onNav, status }: { id: string; label: string; onClose: () => void; children?: ReactNode; /** The piece's standing on the board right now (under protection, shielded), shown above the rank. */ status?: ReactNode; /** No backdrop blur: for the match, where the board behind keeps animating and a blurred backdrop would be recomputed every frame. */ flat?: boolean; siblings?: string[]; onNav?: (id: string) => void }) {
  const { placeholders } = useDisplay();
  useLedger();
  const rank = rankOf(id);
  const finish = finishOf(id);
  const next = nextRank(id);
  const price = next ? RANK_PRICE[next] : 0;
  const can = !!next && balance() >= price;
  const [flash, setFlash] = useState(false);
  const def = CARD_BY_ID[id];
  if (!def) return null;
  const mythic = def.kind === 'character' && def.category === 'mythic';
  const history = placeholders ? undefined : def.history;
  return (
    <Stage
      name={cardName(id, placeholders)}
      label={label}
      onClose={onClose}
      flat={flat}
      siblings={siblings}
      onNav={onNav}
      panel={<CardFace id={id} big />}
      history={history}
      historyLabel={mythic ? 'Origins' : 'History'}
      historyTag={mythic ? 'A figure of faith and folklore, not a historical person. Here is where the story comes from.' : undefined}
      refsId={history ? id : undefined}
      below={
        /* The piece's standing (from the match), then the card's rank and the way up: Legacy buys the next frame.
           Cosmetic only; the numbers never change. */
        def.kind === 'character' ? (
          <>
          {status}
          <div className={`cx-rank rank-${finish ?? rank} ${flash ? 'flash' : ''}`}>
            <span className="cx-rank-medal" aria-hidden />
            <span className="cx-rank-lbl">{finish ? `${FINISH_LABEL[finish]} finish · ${RANK_LABEL[rank]} rank` : `${RANK_LABEL[rank]} rank`}</span>
            {next ? (
              <button
                className="cx-btn cx-ctl cx-rank-btn"
                disabled={!can}
                data-sfx={can ? 'card.select' : 'off'}
                onClick={() => {
                  if (promote(id) === 'ok') {
                    setFlash(true);
                    window.setTimeout(() => setFlash(false), 900);
                  }
                }}
                {...tip(can ? `Promote ${cardName(id, placeholders)} to ${RANK_LABEL[next]} for ${price} Legacy. You have ${balance()}. The frame changes; the card does not.` : `${RANK_LABEL[next]} costs ${price} Legacy; you have ${balance()}. Win matches to earn it: a match pays its Legacy to the winner.`)}
              >
                {RANK_LABEL[next]} · {price} ★
              </button>
            ) : (
              <span className="cx-rank-max">{fixedRank(id) ? `Only comes in ${RANK_LABEL[rank]}` : 'Highest rank'}</span>
            )}
          </div>
          </>
        ) : undefined
      }
    >
      {children}
    </Stage>
  );
}
