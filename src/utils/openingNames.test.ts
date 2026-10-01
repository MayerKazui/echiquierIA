import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTsv } from '../../scripts/openingsDataset';
import { toFrenchOpeningName as fr } from './openingNames';

describe('toFrenchOpeningName', () => {
  describe('the nouns and their agreement', () => {
    it.each([
      ['Sicilian Defense', 'Défense sicilienne'],
      ['Italian Game', 'Partie italienne'],
      ['English Opening', 'Ouverture anglaise'],
      ['Scotch Game', 'Partie écossaise'],
      ['Danish Gambit', 'Gambit danois'],
      ['Latvian Gambit', 'Gambit letton'],
      ['Catalan Opening', 'Ouverture catalane'],
      ['Scandinavian Defense', 'Défense scandinave'],
      ['Czech Defense', 'Défense tchèque'],
    ])('%s', (english, french) => expect(fr(english)).toBe(french));

    it('puts the name of a player after the noun, without a preposition', () => {
      expect(fr('Alekhine Defense')).toBe('Défense Alekhine');
      expect(fr('Colle System')).toBe('Système Colle');
      expect(fr('Evans Gambit')).toBe('Gambit Evans');
      expect(fr('Falkbeer Countergambit')).toBe('Contre-gambit Falkbeer');
      expect(fr('Bird Opening')).toBe('Ouverture Bird');
    });

    it('agrees the adjectives with the gender of the noun', () => {
      expect(fr('Gambit Accepted')).toBe('Gambit accepté');
      expect(fr('Semi-Slav Defense Accepted')).toBe('Défense semi-slave acceptée');
      expect(fr('Benko Gambit Declined')).toBe('Gambit Benko refusé');
      expect(fr('Sicilian Defense: Closed Variation')).toBe('Défense sicilienne : variante fermée');
      expect(fr('Sicilian Defense: Closed System')).toBe('Défense sicilienne : système fermé');
    });

    it('agrees with a plural noun', () => {
      expect(fr('Sicilian Defense: Modern Variations')).toBe('Défense sicilienne : variantes modernes');
      expect(fr('Sicilian Defense: Early Deviations')).toBe('Défense sicilienne : déviations précoces');
    });
  });

  describe('the family names that are not "<name> <noun>"', () => {
    it.each([
      ['Ruy Lopez', 'Partie espagnole'],
      ["King's Gambit", 'Gambit du roi'],
      ["King's Gambit Accepted", 'Gambit du roi accepté'],
      ["Queen's Gambit Declined", 'Gambit dame refusé'],
      ["Queen's Gambit Accepted", 'Gambit dame accepté'],
      ["King's Indian Defense", 'Défense est-indienne'],
      ["Queen's Indian Defense", 'Défense ouest-indienne'],
      ['Nimzo-Indian Defense', 'Défense nimzo-indienne'],
      ['Bogo-Indian Defense', 'Défense bogo-indienne'],
      ['Old Indian Defense', 'Défense vieille-indienne'],
      ["Bishop's Opening", 'Ouverture du fou'],
      ["King's Pawn Game", 'Partie du pion roi'],
      ["Queen's Pawn Game", 'Partie du pion dame'],
      ['London System', 'Système de Londres'],
      ['Four Knights Game', 'Partie des quatre cavaliers'],
      ['Three Knights Opening', 'Ouverture des trois cavaliers'],
      ['Center Game', 'Partie du centre'],
      ["Petrov's Defense", 'Défense Petrov'],
      ["Anderssen's Opening", 'Ouverture Anderssen'],
      ['Dutch Defense', 'Défense hollandaise'],
      ['Vienna Game', 'Partie viennoise'],
      ['Vienna Gambit', 'Gambit viennois'],
      ['Slav Indian', 'Slave-indienne'],
      ['Hippopotamus Defense', "Défense de l'hippopotame"],
      ['Neo-Grünfeld Defense', 'Défense Néo-Grünfeld'],
      ['Caro-Kann Defense', 'Défense Caro-Kann'],
    ])('%s', (english, french) => expect(fr(english)).toBe(french));
  });

  describe('the parts after the colon', () => {
    it('writes a colon with a space before it, and begins with the noun in lower case', () => {
      expect(fr('Sicilian Defense: Dragon Variation')).toBe('Défense sicilienne : variante Dragon');
    });

    it('separates the parts with a comma', () => {
      expect(fr('Ruy Lopez: Open, Berger Variation')).toBe('Partie espagnole : variante ouverte, variante Berger');
    });

    it('keeps the commas of the family part', () => {
      expect(fr("King's Indian Attack, with Bf5")).toBe('Attaque est-indienne, avec Ff5');
    });

    it('keeps a name that begins a part with its capital letter', () => {
      expect(fr('Sicilian Defense: Najdorf')).toBe('Défense sicilienne : Najdorf');
      expect(fr('Pterodactyl Defense: Sicilian, Siroccopteryx')).toBe(
        'Défense Pterodactyl : Sicilienne, Siroccopteryx'
      );
    });

    it('is the family alone when there is no colon', () => {
      expect(fr('French Defense')).toBe('Défense française');
    });
  });

  describe('the modifiers', () => {
    it('turns a noun that complements the variation into "de ..."', () => {
      expect(fr('French Defense: Exchange Variation')).toBe("Défense française : variante d'échange");
      expect(fr('French Defense: Advance Variation')).toBe("Défense française : variante d'avance");
      expect(fr("Queen's Indian Defense: Fianchetto Variation")).toBe(
        'Défense ouest-indienne : variante du fianchetto'
      );
      expect(fr('Italian Game: Two Knights Defense')).toBe('Partie italienne : défense des deux cavaliers');
      expect(fr("King's Indian Defense: Four Pawns Attack")).toBe('Défense est-indienne : attaque des quatre pions');
      expect(fr('Sicilian Defense: Wing Gambit')).toBe("Défense sicilienne : gambit de l'aile");
      expect(fr('Ruy Lopez: Berlin Defense')).toBe('Partie espagnole : défense de Berlin');
      expect(fr('French Defense: Winawer Variation, Poisoned Pawn Variation')).toBe(
        'Défense française : variante Winawer, variante du pion empoisonné'
      );
    });

    it('puts the adjectives after the name that follows the noun ("Delayed Alapin Variation")', () => {
      expect(fr('Sicilian Defense: Delayed Alapin Variation')).toBe('Défense sicilienne : variante Alapin retardée');
      expect(fr('Ruy Lopez: Berlin Defense, Closed Showalter Variation')).toBe(
        'Partie espagnole : défense de Berlin, variante Showalter fermée'
      );
    });

    it('reverses the adjectives said before the noun ("Modern Main Line")', () => {
      expect(fr('Ruy Lopez: Marshall Attack, Modern Main Line')).toBe(
        'Partie espagnole : attaque Marshall, ligne principale moderne'
      );
    });

    it('keeps the order of the complements and puts the adjective at the end', () => {
      expect(fr('Zukertort Opening: Kingside Fianchetto')).toBe(
        "Ouverture Zukertort : variante du fianchetto de l'aile roi"
      );
    });

    it('handles compound adjectives', () => {
      expect(fr('English Opening: Anglo-Indian Defense')).toBe('Ouverture anglaise : défense anglo-indienne');
      expect(fr('Réti Opening: Anglo-Slav Variation')).toBe('Ouverture Réti : variante anglo-slave');
      expect(fr('Hungarian Opening: Neo-Catalan')).toBe('Ouverture hongroise : variante néo-catalane');
    });

    it('keeps a prefix before a name', () => {
      expect(fr('Sicilian Defense: Anti-Sveshnikov Variation')).toBe('Défense sicilienne : variante Anti-Sveshnikov');
    });

    it('translates the adjectives of a compound that has a name in it', () => {
      expect(fr('Indian Defense: Czech-Indian')).toBe('Défense indienne : Tchèque-indien');
    });
  });

  describe('parts with no noun', () => {
    it('is a variation when there are only adjectives or complements', () => {
      expect(fr('Ruy Lopez: Closed')).toBe('Partie espagnole : variante fermée');
      expect(fr('Pterodactyl Defense: Eastern')).toBe('Défense Pterodactyl : variante orientale');
      expect(fr('French Defense: Advance')).toBe("Défense française : variante d'avance");
      expect(fr('Sicilian Defense: Fianchetto')).toBe('Défense sicilienne : variante du fianchetto');
    });

    it('stands for the opening when it is a nationality, with its adjectives after it', () => {
      expect(fr('English Opening: Reversed Sicilian')).toBe('Ouverture anglaise : Sicilienne inversée');
      expect(fr('English Opening: Reversed Closed Sicilian')).toBe('Ouverture anglaise : Sicilienne fermée inversée');
    });

    it('puts several adjectives after the names in the reverse order', () => {
      expect(fr('Sicilian Defense: Old Reversed Dragon')).toBe('Défense sicilienne : Dragon inversé ancien');
    });

    it('keeps names in their order and puts the adjectives after them', () => {
      expect(fr('Sicilian Defense: Accelerated Dragon')).toBe('Défense sicilienne : Dragon accéléré');
      expect(fr('Englund Gambit Declined: Reversed Brooklyn')).toBe('Gambit Englund refusé : Brooklyn inversé');
    });
  });

  describe('moves', () => {
    it('writes the pieces of a move in French', () => {
      expect(fr("Queen's Gambit Declined: Albin Countergambit, Bg4 Line")).toContain('ligne Fg4');
      expect(fr("King's Indian Defense: Averbakh Variation, Nc6 Defense")).toContain('défense Cc6');
      expect(fr('Sicilian Defense: Alapin Variation, with Qd2')).toContain('avec Dd2');
      expect(fr('Sicilian Defense: Alapin Variation, with Bb4+')).toContain('avec Fb4+');
    });

    it('writes the king as a rook in French notation (the king is "R")', () => {
      expect(fr('Sicilian Defense: Alapin Variation, with Kf1')).toContain('avec Rf1');
    });

    it('keeps pawn moves as they are', () => {
      expect(fr('Sicilian Defense: Closed, with d6')).toBe('Défense sicilienne : variante fermée, avec d6');
      expect(fr('Sicilian Defense: Closed, with dxc4')).toContain('avec dxc4');
      expect(fr("English Opening: King's English Variation, Delayed .. Nc6")).toContain('.. Cc6 retardé');
    });

    it('says "avec" for "with" and "et" for "and"', () => {
      expect(fr("Queen's Indian Defense: with Bc4 and h6")).toContain('avec Fc4 et h6');
    });
  });

  describe('names', () => {
    it('keeps a possessive name next to the noun without its "\'s"', () => {
      expect(fr("King's Gambit Declined: Keene's Defense")).toBe('Gambit du roi refusé : défense Keene');
      expect(fr("Bird Opening: From's Gambit")).toBe('Ouverture Bird : gambit From');
    });

    it('keeps a possessive that is not next to a noun as it is (a nickname)', () => {
      expect(fr("King's Pawn Game: King's Head Opening")).toBe("Partie du pion roi : ouverture King's Head");
      expect(fr("Sicilian Defense: Lion's Cave")).toBe("Défense sicilienne : Lion's Cave");
    });

    it('translates the pieces of a nickname', () => {
      expect(fr('Pterodactyl Defense: Queen Pterodactyl')).toBe('Défense Pterodactyl : dame Pterodactyl');
    });

    it('keeps an unknown word as it is (a player, a place, a nickname)', () => {
      expect(fr('Hungarian Opening: Wiedenhagen-Beta Gambit')).toBe('Ouverture hongroise : gambit Wiedenhagen-Beta');
      expect(fr('Colle System: Pterodactyl Variation')).toBe('Système Colle : variante Pterodactyl');
      expect(fr('Van Geet Opening')).toBe('Ouverture Van Geet');
    });

    it('accepts the typographic apostrophe of some sources', () => {
      expect(fr('King’s Gambit Accepted')).toBe('Gambit du roi accepté');
      expect(fr('Petrov’s Defense: Classical Attack')).toBe('Défense Petrov : attaque classique');
    });
  });

  describe('expressions', () => {
    it('translates the expressions as a whole', () => {
      expect(fr("Barnes Opening: Fool's Mate")).toBe('Ouverture Barnes : mat du fou');
      expect(fr("Kádas Opening: Beginner's Trap")).toBe('Ouverture Kádas : piège du débutant');
      expect(fr("Zukertort Opening: Queen's Gambit Invitation")).toBe(
        'Ouverture Zukertort : invitation au gambit dame'
      );
    });
  });

  describe('edge cases', () => {
    it('returns an empty name as it is', () => {
      expect(fr('')).toBe('');
    });

    it('gives the same answer twice', () => {
      expect(fr('Sicilian Defense: Dragon Variation')).toBe(fr('Sicilian Defense: Dragon Variation'));
    });

    it('does not break on text that is not an opening name', () => {
      expect(fr('???')).toBe('???');
      expect(fr('A: : B')).toBeTypeOf('string');
      expect(fr(',')).toBeTypeOf('string');
    });

    it('does not translate a French name again', () => {
      expect(fr('Défense sicilienne : variante Dragon')).toBe('Défense sicilienne : variante Dragon');
    });
  });
});

describe('the whole openings database', () => {
  const names = [
    ...new Set(
      ['a', 'b', 'c', 'd', 'e'].flatMap((letter) =>
        parseTsv(readFileSync(resolve(__dirname, `../data/openings/${letter}.tsv`), 'utf8')).map((line) => line.name)
      )
    ),
  ];

  /** English words of the lexicon that must not be left in a French name. */
  const ENGLISH = new Set(
    (
      'Variation Variations Defense Defenses Opening Attack Counterattack Game Countergambit System Line Trap Mate ' +
      'Bind Sacrifice Transfer Refutation Invitation Folly Plan Break Unpin Extension Hybrid Endgame Development Wall ' +
      'Deviations Accepted Declined Deferred Delayed Accelerated Hyperaccelerated Classical Modern Closed Open Main ' +
      'Normal Old Quiet Symmetrical Reversed Traditional Positional Central Early Immediate Improved Original Poisoned ' +
      'Full Defensive Dynamic Forcing Forgotten Slow Small Special Extended Eastern Western Kingside Queenside ' +
      'Sicilian French English Italian Spanish Dutch Scotch Danish Polish Hungarian Czech Austrian Portuguese Latvian ' +
      'Scandinavian Russian Slav Indian Catalan Exchange Advance Fianchetto Knights Pawns Pawn Knight Bishop Queen King ' +
      'with and Orthodox Retreat Center Wing Castling Check Order Move Swap Correspondence Flank Counterthrust'
    ).split(' ')
  );

  it('has the names it is tested on', () => {
    expect(names.length).toBeGreaterThan(3000);
  });

  it('translates the structure of every name: no English word of the lexicon is left', () => {
    const left = names.flatMap((name) => {
      const words = fr(name).split(/[\s,:()'’-]+/);
      return words.filter((word) => ENGLISH.has(word)).map((word) => `${word} in "${name}" → "${fr(name)}"`);
    });
    // "King's Head" is a nickname kept as it is
    expect(left.filter((line) => !line.includes("King's Head"))).toEqual([]);
  });

  it('keeps every part of every name (same number of colons and commas)', () => {
    for (const name of names) {
      const french = fr(name);
      expect(french.split(' : ').length, name).toBe(name.split(':').length);
      expect(french.split(', ').length, name).toBe(name.split(',').length);
    }
  });

  it('writes clean names: a capital first, no double or edge spaces, no placeholder', () => {
    for (const name of names) {
      const french = fr(name);
      expect(french, name).toMatch(/^\p{Lu}/u);
      expect(french, name).not.toMatch(/\s{2,}|^\s|\s$|undefined|\[object/);
    }
  });

  it('translates most of the names (what stays equal is a name alone)', () => {
    const changed = names.filter((name) => fr(name) !== name);
    expect(changed.length / names.length).toBeGreaterThan(0.97);
  });

  it('gives each name one translation, whatever the order it is asked in', () => {
    const forward = names.map(fr);
    const backward = [...names].reverse().map(fr).reverse();
    expect(backward).toEqual(forward);
  });

  it('translates the most frequent families as the French usage has it', () => {
    const wanted: Record<string, string> = {
      'Sicilian Defense': 'Défense sicilienne',
      'Ruy Lopez': 'Partie espagnole',
      'French Defense': 'Défense française',
      "Queen's Gambit Declined": 'Gambit dame refusé',
      'Italian Game': 'Partie italienne',
      'English Opening': 'Ouverture anglaise',
      "King's Gambit Accepted": 'Gambit du roi accepté',
      "King's Indian Defense": 'Défense est-indienne',
      'Caro-Kann Defense': 'Défense Caro-Kann',
      'Nimzo-Indian Defense': 'Défense nimzo-indienne',
    };
    for (const [english, french] of Object.entries(wanted)) {
      expect(names).toContain(english);
      expect(fr(english)).toBe(french);
    }
  });
});
