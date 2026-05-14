import { parseLdyFile, parseSection } from '@lordts/core/lady/LdyParser';

describe('LdyParser', () => {
    describe('parseLdyFile', () => {
        test('should parse a file with one section', () => {
            const content = `@#MYSECTION\n@writeln Hello World\n`;
            const sections = parseLdyFile(content, 'test.ldy');

            expect(sections.size).toBe(1);
            expect(sections.has('MYSECTION')).toBe(true);

            const cmds = sections.get('MYSECTION')!;
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('writeln');
            expect((cmds[0] as unknown as Record<string, unknown>).text).toBe('Hello World');
        });

        test('should parse multiple sections', () => {
            const content = [
                '@#SECTION_A',
                '@writeln Line A',
                '@#SECTION_B',
                '@writeln Line B',
                '@writeln Line B2',
            ].join('\n');

            const sections = parseLdyFile(content, 'test.ldy');

            expect(sections.size).toBe(2);
            expect(sections.has('SECTION_A')).toBe(true);
            expect(sections.has('SECTION_B')).toBe(true);

            expect(sections.get('SECTION_A')!.length).toBe(1);
            expect(sections.get('SECTION_B')!.length).toBe(2);
        });

        test('should uppercase section names', () => {
            const content = '@#mySection\n@writeln hi\n';
            const sections = parseLdyFile(content, 'test.ldy');

            expect(sections.has('MYSECTION')).toBe(true);
        });

        test('should skip lines before the first section', () => {
            const content = [
                'Some preamble text',
                '; a comment',
                '@#FIRST',
                '@writeln Inside',
            ].join('\n');

            const sections = parseLdyFile(content, 'test.ldy');
            expect(sections.size).toBe(1);
            expect(sections.get('FIRST')!.length).toBe(1);
        });

        test('should skip comment lines (starting with ;)', () => {
            const content = [
                '@#TEST',
                '; This is a comment',
                '@writeln Not a comment',
                ';Another comment',
            ].join('\n');

            const sections = parseLdyFile(content, 'test.ldy');
            const cmds = sections.get('TEST')!;

            // Only the @writeln should survive; comments are stripped
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('writeln');
        });

        test('should handle empty sections', () => {
            const content = '@#EMPTY\n@#NOTEMPTY\n@writeln hi\n';
            const sections = parseLdyFile(content, 'test.ldy');

            expect(sections.get('EMPTY')!.length).toBe(0);
            expect(sections.get('NOTEMPTY')!.length).toBe(1);
        });
    });

    describe('parseSection - commands', () => {
        test('should parse @writeln', () => {
            const cmds = parseSection(['@writeln `2Hello `0World'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('writeln');
            expect((cmds[0] as unknown as Record<string, unknown>).text).toBe('`2Hello `0World');
        });

        test('should strip trailing ; comment from @writeln', () => {
            const cmds = parseSection(['@writeln text here  ; this is a comment'], 'test.ldy');
            expect((cmds[0] as unknown as Record<string, unknown>).text).toBe('text here');
        });

        test('@writeln with only a ; comment should produce blank line', () => {
            const cmds = parseSection(['@writeln                          ; Added 12/27/03.'], 'test.ldy');
            expect((cmds[0] as unknown as Record<string, unknown>).text).toBe('');
        });

        test('should parse @write', () => {
            const cmds = parseSection(['@write Inline text'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('write');
            expect((cmds[0] as unknown as Record<string, unknown>).text).toBe('Inline text');
        });

        test('should parse @set with simple value', () => {
            const cmds = parseSection(['@set &N1 to 5'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('set');
            expect((cmds[0] as unknown as Record<string, unknown>).variable).toBe('&N1');
            expect((cmds[0] as unknown as Record<string, unknown>).value).toBe('5');
        });

        test('should parse @set with increment', () => {
            const cmds = parseSection(['@set &Pgo to +500'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('set');
            expect((cmds[0] as unknown as Record<string, unknown>).variable).toBe('&Pgo');
            expect((cmds[0] as unknown as Record<string, unknown>).value).toBe('+500');
        });

        test('should parse @set with decrement', () => {
            const cmds = parseSection(['@set &Pff to -1'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('set');
            expect((cmds[0] as unknown as Record<string, unknown>).variable).toBe('&Pff');
            expect((cmds[0] as unknown as Record<string, unknown>).value).toBe('-1');
        });

        test('should parse @set boolean', () => {
            const cmds = parseSection(['@set &Pho to true'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('set');
            expect((cmds[0] as unknown as Record<string, unknown>).variable).toBe('&Pho');
            expect((cmds[0] as unknown as Record<string, unknown>).value).toBe('true');
        });

        test('should parse @math with binary expression', () => {
            const cmds = parseSection(['@math &N1 = 500 * &Plv'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('math');
            expect((cmds[0] as unknown as Record<string, unknown>).target).toBe('&N1');
            expect((cmds[0] as unknown as Record<string, unknown>).expression).toBe('500 * &Plv');
        });

        test('should parse @math with single operand', () => {
            const cmds = parseSection(['@math &N1 = &rnd9'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('math');
            expect((cmds[0] as unknown as Record<string, unknown>).target).toBe('&N1');
            expect((cmds[0] as unknown as Record<string, unknown>).expression).toBe('&rnd9');
        });

        test('should parse @if with numeric comparison', () => {
            const cmds = parseSection(['@if &Pht < &Phx 1'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('if');

            const ifCmd = cmds[0] as unknown as Record<string, unknown>;
            expect(ifCmd.left).toBe('&Pht');
            expect(ifCmd.operator).toBe('<');
            expect(ifCmd.right).toBe('&Phx');
            expect(ifCmd.id).toBe('1');
        });

        test('should parse @if with "is" boolean check', () => {
            const cmds = parseSection(['@if &Pho is true 1'], 'test.ldy');
            expect(cmds.length).toBe(1);
            const ifCmd = cmds[0] as unknown as Record<string, unknown>;
            expect(ifCmd.left).toBe('&Pho');
            expect(ifCmd.operator).toBe('is');
            expect(ifCmd.right).toBe('true');
            expect(ifCmd.id).toBe('1');
        });

        test('should parse @if with equality', () => {
            const cmds = parseSection(['@if &Pcl = 3 1'], 'test.ldy');
            expect(cmds.length).toBe(1);
            const ifCmd = cmds[0] as unknown as Record<string, unknown>;
            expect(ifCmd.left).toBe('&Pcl');
            expect(ifCmd.operator).toBe('=');
            expect(ifCmd.right).toBe('3');
        });

        test('should parse @else and @endif', () => {
            const cmds = parseSection([
                '@if &Pch < 10 1',
                '@writeln low charm',
                '@else 1',
                '@writeln high charm',
                '@endif 1',
            ], 'test.ldy');

            expect(cmds.length).toBe(5);
            expect(cmds[0].type).toBe('if');
            expect(cmds[1].type).toBe('writeln');
            expect(cmds[2].type).toBe('else');
            expect(cmds[3].type).toBe('writeln');
            expect(cmds[4].type).toBe('endif');
        });

        test('should parse @choice', () => {
            const cmds = parseSection(['@choice YN   Do you accept?'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('choice');
            expect((cmds[0] as unknown as Record<string, unknown>).options).toBe('YN');
            expect((cmds[0] as unknown as Record<string, unknown>).prompt).toContain('Do you accept?');
        });

        test('should parse @case/@endcase', () => {
            const cmds = parseSection([
                '@case responce 1',
                'Y: @writeln Yes!',
                'N: @writeln No!',
                '@endcase 1',
            ], 'test.ldy');

            expect(cmds.length).toBe(4);
            expect(cmds[0].type).toBe('case_start');
            expect((cmds[0] as unknown as Record<string, unknown>).variable).toBe('responce');
            expect((cmds[0] as unknown as Record<string, unknown>).id).toBe('1');
            expect(cmds[1].type).toBe('case_label');
            expect((cmds[1] as unknown as Record<string, unknown>).label).toBe('Y');
            expect(cmds[2].type).toBe('case_label');
            expect((cmds[2] as unknown as Record<string, unknown>).label).toBe('N');
            expect(cmds[3].type).toBe('case_end');
        });

        test('should parse @display/@enddisplay', () => {
            const cmds = parseSection([
                '@display',
                '  `2Some displayed text',
                '@enddisplay',
            ], 'test.ldy');

            expect(cmds.length).toBe(3);
            expect(cmds[0].type).toBe('display_start');
            expect(cmds[1].type).toBe('text');
            expect((cmds[1] as unknown as Record<string, unknown>).value).toBe('  `2Some displayed text');
            expect(cmds[2].type).toBe('display_end');
        });

        test('should preserve blank lines inside @display blocks', () => {
            const cmds = parseSection([
                '@display',
                '  `2Top line',
                '',
                '  `2Bottom line',
                '@enddisplay',
            ], 'test.ldy');

            expect(cmds.length).toBe(5);
            expect(cmds[0].type).toBe('display_start');
            expect(cmds[1]).toMatchObject({ type: 'text', value: '  `2Top line' });
            expect(cmds[2]).toMatchObject({ type: 'text', value: '' });
            expect(cmds[3]).toMatchObject({ type: 'text', value: '  `2Bottom line' });
            expect(cmds[4].type).toBe('display_end');
        });

        test('should parse @runsub', () => {
            const cmds = parseSection(['@runsub OLDMAN oldman.ldy'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('runsub');
            expect((cmds[0] as unknown as Record<string, unknown>).section).toBe('OLDMAN');
            expect((cmds[0] as unknown as Record<string, unknown>).file).toBe('oldman.ldy');
        });

        test('should parse @runsub with &filename', () => {
            const cmds = parseSection(['@runsub GEM &filename'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('runsub');
            expect((cmds[0] as unknown as Record<string, unknown>).section).toBe('GEM');
            expect((cmds[0] as unknown as Record<string, unknown>).file).toBe('&filename');
        });

        test('should parse @hitakey', () => {
            const cmds = parseSection(['@hitakey'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('hitakey');
        });

        test('should parse @clrscr', () => {
            const cmds = parseSection(['@clrscr'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('clrscr');
        });

        test('should parse @endquest', () => {
            const cmds = parseSection(['@endquest'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('endquest');
        });

        test('should parse @endgame', () => {
            const cmds = parseSection(['@endgame'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('endgame');
        });

        test('should parse @delay', () => {
            const cmds = parseSection(['@delay 500'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('delay');
        });

        test('should parse @saveplayer', () => {
            const cmds = parseSection(['@saveplayer'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('saveplayer');
        });

        test('should parse @verreq', () => {
            const cmds = parseSection(['@verreq 407'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('verreq');
        });

        test('should parse @begin/@end blocks', () => {
            const cmds = parseSection([
                '@begin',
                '@writeln inside block',
                '@end',
            ], 'test.ldy');

            expect(cmds.length).toBe(3);
            expect(cmds[0].type).toBe('begin');
            expect(cmds[1].type).toBe('writeln');
            expect(cmds[2].type).toBe('end');
        });

        test('should parse @label and @goto', () => {
            const cmds = parseSection([
                '@label TRYAGAIN',
                '@writeln trying...',
                '@goto TRYAGAIN',
            ], 'test.ldy');

            expect(cmds.length).toBe(3);
            expect(cmds[0].type).toBe('label');
            expect((cmds[0] as unknown as Record<string, unknown>).name).toBe('TRYAGAIN');
            expect(cmds[2].type).toBe('goto');
            expect((cmds[2] as unknown as Record<string, unknown>).target).toBe('TRYAGAIN');
        });

        test('should parse @@ as literal @', () => {
            const cmds = parseSection(['@@literal at sign'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('writeln');
            expect((cmds[0] as unknown as Record<string, unknown>).text).toBe('@literal at sign');
        });

        test('should parse bare text as text nodes', () => {
            const cmds = parseSection(['  `2Some bare text line'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('text');
            expect((cmds[0] as unknown as Record<string, unknown>).value).toBe('`2Some bare text line');
        });

        test('should handle unknown commands gracefully', () => {
            const cmds = parseSection(['@nosuchcommand foo bar'], 'test.ldy');
            expect(cmds.length).toBe(1);
            expect(cmds[0].type).toBe('unknown');
        });
    });

    describe('parseLdyFile - real-world scripts', () => {
        test('should parse gem.ldy structure', () => {
            const content = [
                '@#INSTALL',
                '@eventname GEM',
                '@author Seth Able',
                '@authid GEM1',
                '@codebegin',
                '@runsub GEM &filename',
                '@codeend',
                '@target forest',
                '',
                '@#UNINSTALL',
                '',
                '@#GEM',
                '@verreq 407',
                '@writeln `c  `%Event In The Forest`0',
                '@writeln `l',
                '@writeln',
                '@writeln   `2Fortune smiles, and you find a gem!',
                '@writeln',
                '@set &Pge to +1',
                '@hitakey',
                '@clrscr',
                '@endquest',
            ].join('\n');

            const sections = parseLdyFile(content, 'gem.ldy');

            expect(sections.size).toBe(3);
            expect(sections.has('INSTALL')).toBe(true);
            expect(sections.has('UNINSTALL')).toBe(true);
            expect(sections.has('GEM')).toBe(true);

            const gemCmds = sections.get('GEM')!;
            // verreq + 5 writelns + set + hitakey + clrscr + endquest = 10
            const types = gemCmds.map(c => c.type);
            expect(types).toContain('verreq');
            expect(types).toContain('writeln');
            expect(types).toContain('set');
            expect(types).toContain('hitakey');
            expect(types).toContain('clrscr');
            expect(types).toContain('endquest');

            // Verify the @set increments gems
            const setCmd = gemCmds.find(c => c.type === 'set') as unknown as Record<string, unknown>;
            expect(setCmd.variable).toBe('&Pge');
            expect(setCmd.value).toBe('+1');
        });

        test('should parse oldman.ldy with @if/@else/@endif and @case', () => {
            const content = [
                '@#OLDMAN',
                '@verreq 407',
                '@display',
                '`c  `%Event In The Forest`0',
                '`l',
                '',
                '  `2You come across an old man.',
                '@enddisplay',
                '@choice YN   Do you take the old man? [`0Y`2]',
                '@writeln',
                '@case responce 1',
                'Y: @begin',
                '    @math &N1 = 500 * &Plv',
                '    @set &Pgo to +&N1',
                '    @writeln   `2Gold: `%&N1',
                '    @set &Pch to +1',
                '    @set &Pff to -1',
                '   @end',
                'N: @begin',
                '    @if &Pch < 10 1',
                '     @begin',
                '      @writeln   `2Cold response.',
                '     @end',
                '     @else 1',
                '     @begin',
                '      @writeln   `2Firm response.',
                '     @end',
                '    @endif 1',
                '   @end',
                '@endcase 1',
                '@writeln',
                '@hitakey',
                '@clrscr',
            ].join('\n');

            const sections = parseLdyFile(content, 'oldman.ldy');
            expect(sections.has('OLDMAN')).toBe(true);

            const cmds = sections.get('OLDMAN')!;
            const types = cmds.map(c => c.type);

            expect(types).toContain('display_start');
            expect(types).toContain('display_end');
            expect(types).toContain('choice');
            expect(types).toContain('case_start');
            expect(types).toContain('case_label');
            expect(types).toContain('case_end');
            expect(types).toContain('math');
            expect(types).toContain('set');
            expect(types).toContain('if');
            expect(types).toContain('else');
            expect(types).toContain('endif');
            expect(types).toContain('begin');
            expect(types).toContain('end');
        });
    });
});
