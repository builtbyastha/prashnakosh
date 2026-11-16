import asyncio, json, re, sys
from playwright.async_api import async_playwright, expect
URL='http://localhost:8765/index.html'
results=[]
def ok(name, cond, detail=''):
    results.append((name, bool(cond), detail)); print(('PASS ' if cond else 'FAIL ')+name+(' — '+str(detail) if detail else ''), flush=True)

async def newpage(b, mobile=False):
    ctx = await b.new_context(viewport={'width':390,'height':844} if mobile else {'width':1366,'height':900}, device_scale_factor=2 if mobile else 1)
    pg = await ctx.new_page()
    pg.errs=[]
    pg.on('pageerror', lambda e: pg.errs.append(str(e)))
    pg.on('console', lambda m: pg.errs.append(m.text) if m.type=='error' and 'ERR_FAILED' not in m.text else None)
    await pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    await pg.goto(URL); await pg.wait_for_selector('text=Demo accounts', timeout=20000)
    return ctx, pg

async def ws(pg, expr):
    return await pg.evaluate(f"(() => {{ const ws = window.__pk.store.ws; const S = window.__pk.S; const st = window.__pk.store; return {expr}; }})()")

async def login(pg, email, pw):
    await pg.fill('#f-email', email); await pg.fill('#f-pass', pw); await pg.click('button[type=submit]'); await pg.wait_for_timeout(600)

async def nav(pg, label):
    await pg.click(f'.side .nav-item:has-text("{label}")'); await pg.wait_for_timeout(300)

async def admin_journey(b):
    ctx, pg = await newpage(b)
    await login(pg, 'admin@prashnakosh.demo', 'wrong')
    ok('bad password rejected', await pg.locator('text=do not match').count() > 0)
    await login(pg, 'admin@prashnakosh.demo', 'Admin@123')
    ok('1a admin signs in', await pg.locator('h1:has-text("Control centre")').count() == 1)
    # create exam
    await nav(pg, 'Exams & blueprints')
    await pg.click('button:has-text("New examination")'); await pg.fill('#ex-name', 'RRB NTPC (test)'); await pg.fill('#ex-short', 'RRB NTPC'); await pg.fill('#ex-cat', 'Railways')
    await pg.click('.modal-foot button:has-text("Save")'); await pg.wait_for_timeout(300)
    ok('1 admin creates an examination', await pg.locator('h2:has-text("RRB NTPC (test)")').count() == 1)
    card = pg.locator('.card', has=pg.locator('h2:has-text("RRB NTPC (test)")'))
    await card.locator('button:has-text("Pattern")').click()
    await pg.fill('#pt-name', 'CBT 1 (test)'); await pg.fill('#pt-stage', 'CBT 1'); await pg.fill('#v-dur', '30')
    await pg.fill('input[aria-label="Section 1 name"]', 'General Awareness'); await pg.fill('input[aria-label="Section 1 questions"]', '20')
    await pg.locator('.modal .card .chip:has-text("History")').click(); await pg.locator('.modal .card .chip:has-text("Political Science")').click()
    await pg.click('.modal-foot button:has-text("Save pattern")'); await pg.wait_for_timeout(500)
    ok('2 admin configures its pattern', await card.locator('text=CBT 1 (test)').count() == 1 and await card.locator('text=Ready').count() > 0, await card.inner_text())
    # version a pattern
    await card.locator('button:has-text("Open")').click()
    await pg.fill('#v-dur', '35'); await pg.fill('input[aria-label="Change note"]', 'Longer duration')
    await pg.click('.modal-foot button:has-text("Save new version")'); await pg.wait_for_timeout(300)
    vers = await ws(pg, "ws.exams.find(e=>e.short==='RRB NTPC').patterns[0].versions.map(v=>v.durationMin)")
    ok('pattern edits are versioned, old version kept', vers == [30,35], vers)
    # taxonomy
    await nav(pg, 'Subjects & topics')
    row = pg.locator('.tree-row', has=pg.locator('b.name:has-text("History")'))
    await row.locator('button:has-text("Chapter")').click(); await pg.fill('#tx-name', 'Post-Independence India'); await pg.click('.modal-foot button:has-text("Save")'); await pg.wait_for_timeout(300)
    chrow = pg.locator('.tree-row', has=pg.locator('text=Post-Independence India'))
    await chrow.locator('button:has-text("Topic")').click(); await pg.fill('#tx-name', 'Reorganisation of States'); await pg.click('.modal-foot button:has-text("Save")'); await pg.wait_for_timeout(300)
    ok('3 admin adds subjects/chapters/topics', await pg.locator('text=Reorganisation of States').count() == 1)
    # new question via editor
    await nav(pg, 'Question bank')
    await pg.click('button:has-text("New question")'); await pg.wait_for_timeout(300)
    await pg.fill('#q-text', 'The States Reorganisation Act that reorganised states on linguistic lines was passed in which year?')
    for i,t in enumerate(['1950','1953','1956','1960']): await pg.fill(f'input[aria-label="Option {"ABCD"[i]}"]', t)
    await pg.check('input[aria-label="Option C is correct"]')
    await pg.fill('#q-exp', 'The States Reorganisation Act was passed in 1956, following the Fazl Ali Commission report.')
    await pg.fill('#q-src', 'Test source')
    await pg.select_option('#q-sub', label='History'); await pg.select_option('#q-ch', label='Post-Independence India'); await pg.select_option('#q-tp', label='Reorganisation of States')
    await pg.click('.page-head button:has-text("Publish")'); await pg.wait_for_timeout(500)
    st = await ws(pg, "ws.questions.find(q=>q.text.startsWith('The States Reorganisation')).status")
    ok('4 admin adds and publishes a question', st == 'published', st)
    # bulk import
    await nav(pg, 'Bulk import')
    csv = 'Question,Type,Option A,Option B,Option C,Option D,Answer,Explanation,Subject,Chapter,Topic,Difficulty,Exams\n"Who chaired the States Reorganisation Commission of 1953?",single,Fazl Ali,K. M. Panikkar,H. N. Kunzru,Jawaharlal Nehru,A,"Justice Fazl Ali chaired it; Panikkar and Kunzru were members.",History,Post-Independence India,Reorganisation of States,Moderate,UPSC CSE\n"Bad row",single,x,y,,,A,,History,Nope,Nope,Easy,\n"Who was the founder of the Maurya Empire?",single,Ashoka,Bindusara,Chandragupta Maurya,Bimbisara,C,,History,Ancient Indian History,Mauryan Empire,Easy,\n'
    await pg.fill('textarea[aria-label="Paste CSV"]', csv); await pg.click('button:has-text("Preview")'); await pg.wait_for_timeout(500)
    body = await pg.inner_text('main')
    ok('import preview flags error and duplicate', 'not found' in body and 'Duplicate of' in body)
    await pg.click('.sticky-cta button:has-text("Import")'); await pg.wait_for_timeout(400)
    ok('5 admin bulk-uploads questions', await pg.locator('text=Imported 1 question').count() == 1, (await pg.inner_text('main'))[:300])
    # review & approve
    await nav(pg, 'Review queue')
    card = pg.locator('.card', has=pg.locator('text=Who chaired the States Reorganisation'))
    await card.locator('button:has-text("Approve & publish")').click(); await pg.wait_for_timeout(300)
    st = await ws(pg, "ws.questions.find(q=>q.text.startsWith('Who chaired the States')).status")
    ok('4b imported question approved via review queue', st == 'published', st)
    # roll back an import
    await nav(pg, 'Bulk import')
    await pg.fill('textarea[aria-label="Paste CSV"]', 'Question,Option A,Option B,Answer,Subject,Chapter,Topic,Difficulty\n"Rollback test question about linguistic states",yes,no,A,History,Post-Independence India,Reorganisation of States,Easy\n'); await pg.click('button:has-text("Preview")'); await pg.wait_for_timeout(300)
    await pg.click('.sticky-cta button:has-text("Import")'); await pg.wait_for_timeout(300)
    n1 = await ws(pg, "ws.questions.filter(q=>q.text.startsWith('Rollback test')).length")
    await pg.locator('button:has-text("Roll back")').first.click(); await pg.click('.modal-foot button:has-text("Roll back")'); await pg.wait_for_timeout(300)
    n2 = await ws(pg, "ws.questions.filter(q=>q.text.startsWith('Rollback test')).length")
    ok('import rollback removes the batch', n1 == 1 and n2 == 0, (n1, n2))
    # official mock + publish
    await nav(pg, 'Papers & mocks')
    await pg.click('button:has-text("Create official mock")'); await pg.wait_for_timeout(300)
    await pg.select_option('#of-pt', index=1)
    await pg.wait_for_timeout(300)
    await pg.click('.modal-foot button:has-text("Generate")'); await pg.wait_for_timeout(500)
    await pg.click('button:has-text("Publish to students")'); await pg.click('.modal-foot button:has-text("Publish")'); await pg.wait_for_timeout(300)
    ok('official mock published', await pg.locator('text=Published').count() > 0)
    # system checks
    await nav(pg, 'System checks'); await pg.click('button:has-text("Run checks")'); await pg.wait_for_timeout(1500)
    ok('in-app system checks pass', await pg.locator('text=checks passed').count() == 1, (await pg.inner_text('main'))[:400])
    for v in ['Control centre','Users','Analytics','Plans & coupons','Audit log','AI drafting']:
        await nav(pg, v); await pg.wait_for_timeout(200)
    ok('admin pages render without errors', not pg.errs, pg.errs[:5])
    await pg.screenshot(path='/home/claude/e2e/admin.png', full_page=False)
    await nav(pg, 'Control centre'); await pg.screenshot(path='/home/claude/e2e/admin-home.png', full_page=True)
    await ctx.close()

async def student_journey(b):
    ctx, pg = await newpage(b)
    await pg.click('[role=tab]:has-text("Register")')
    await pg.fill('#r-name', 'Test Student'); await pg.fill('#f-email', 'test.student@example.com'); await pg.fill('#f-pass', 'short')
    await pg.click('.chip:has-text("UPSC CSE")'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(300)
    ok('weak password rejected', await pg.locator('text=at least 8 characters').count() > 0)
    await pg.fill('#f-pass', 'Exam2026pass'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(800)
    ok('6 student registers and is signed in', await pg.locator('text=Start with one of these').count() == 1)
    await pg.click('.nav-item:has-text("Sign")') if False else None
    # 7-10 generator
    await nav(pg, 'Create a test')
    await pg.click('.step:nth-child(1) .chip:has-text("UPSC CSE")')
    await pg.click('.chip:has-text("History")'); await pg.click('.chip:has-text("Modern Indian History")')
    await pg.click('.chip:has-text("Revolt of 1857")'); await pg.click('.chip:has-text("Constitutional Developments")')
    await pg.click('.chip:text-is("40")'); await pg.click('.chip:has-text("Mixed (30/50/20)")')
    ok('7-8 student selects exam, subjects and chapters', True)
    await pg.click('button:has-text("Generate paper")'); await pg.wait_for_timeout(600)
    paper = await ws(pg, "(()=>{const p=ws.papers.filter(p=>p.ownerId===st.user.id).pop(); const it=p.sections.flatMap(s=>s.items); const d={}; it.forEach(i=>d[i.difficulty]=(d[i.difficulty]||0)+1); const t={}; it.forEach(i=>t[i.topicId]=(t[i.topicId]||0)+1); return {n:it.length, uniq:new Set(it.map(i=>i.qid)).size, d, t, pass:p.validation.pass, id:p.id}})()")
    ok('9 paper has exactly 40 questions', paper['n'] == 40, paper)
    ok('10 follows difficulty (12/20/8) and topic distribution', paper['d'] == {'easy':12,'moderate':20,'difficult':8} and set(paper['t'].keys()) == {'tp_r57','tp_cdv'} and abs(paper['t']['tp_r57']-paper['t']['tp_cdv'])<=2, paper)
    ok('11 no question repeats', paper['uniq'] == 40)
    await pg.screenshot(path='/home/claude/e2e/create.png', full_page=True)
    await pg.click('button:has-text("Start now")'); await pg.wait_for_timeout(500)
    ok('exam runner opens', await pg.locator('.exam').count() == 1)
    # answer 10 questions: pick option A where available
    for i in range(10):
        opt = pg.locator('.exam-q .opt').first
        if await opt.count(): await opt.click()
        else:
            inp = pg.locator('.exam-q input.input')
            if await inp.count(): await inp.fill('1857')
        await pg.click('button:has-text("Save & next")'); await pg.wait_for_timeout(80)
    await pg.click('button:has-text("Mark for review & next")'); await pg.wait_for_timeout(100)
    await pg.wait_for_timeout(1200)
    before = await ws(pg, "Object.values(ws.attempts.filter(a=>a.userId===st.user.id&&a.status==='in_progress')[0].responses).filter(r=>r.answer!=null&&r.answer!=='').length")
    await pg.reload(); await pg.wait_for_timeout(2500)
    after = await ws(pg, "Object.values(ws.attempts.filter(a=>a.userId===st.user.id&&a.status==='in_progress')[0].responses).filter(r=>r.answer!=null&&r.answer!=='').length")
    ok('13 responses saved reliably across a reload', before == 10 and after == 10 and await pg.locator('.exam').count()==1, (before, after))
    t1 = await pg.inner_text('.timer'); await pg.wait_for_timeout(2100); t2 = await pg.inner_text('.timer')
    ok('12 timer counts down', t1 != t2, (t1, t2))
    # free plan: second mock blocked
    await pg.click('button:has-text("Submit test")') if await pg.locator('button:has-text("Submit test")').is_visible() else None
    await pg.wait_for_timeout(200)
    await pg.locator('.modal-foot button:has-text("Submit")').click(); await pg.wait_for_timeout(700)
    res = await ws(pg, "(()=>{const a=ws.attempts.filter(a=>a.userId===st.user.id&&a.status==='submitted').pop(); const p=ws.papers.find(p=>p.id===a.paperId); const it=p.sections.flatMap(s=>s.items); let sc=0; for(const i of it){const r=a.responses[i.qid]; if(!r||r.answer==null||r.answer==='') continue; const ok = Array.isArray(i.correct)? i.correct.includes(r.answer) || (typeof r.answer==='string' && i.correct.map(x=>String(x).toLowerCase()).includes(r.answer.toLowerCase())) : Math.abs(Number(r.answer)-i.correct.value)<=i.correct.tolerance; sc += ok? i.marks : -i.negative;} return {score:a.result.score, indep:Math.round(sc*100)/100, c:a.result.correct, w:a.result.incorrect, u:a.result.unattempted, neg:a.result.negativeMarks, marks:it[0].marks, negq:it[0].negative}})()")
    ok('14 score correct incl. negative marking', abs(res['score'] - res['indep']) < 0.011 and res['u'] == 30 and abs(res['neg'] - round(res['w']*res['negq'],2))<0.011, res)
    ok('results page shown', await pg.locator('text=Review answers').count() == 1)
    ok('15 explanations hidden on Free plan, answer key shown after submit', await pg.locator('text=Detailed explanations are included in Basic').count() > 0 and await pg.locator('.opt.correct').count() > 0)
    await pg.screenshot(path='/home/claude/e2e/result.png', full_page=False)
    # 19 entitlements
    await nav(pg, 'Create a test')
    ok('19 free plan: second mock of the day blocked', await pg.locator('text=Free includes 1 mock test a day').count() > 0)
    await nav(pg, 'Exam simulator')
    ok('19 free plan: simulator locked', await pg.locator('text=full-length simulator is part of Premium').count() > 0 and await pg.locator('button:has-text("Start simulation")').first.is_disabled())
    # 16 previous attempts accessible
    await nav(pg, 'My tests')
    ok('16 previous attempts listed', await pg.locator('table.tbl tbody tr').count() >= 1)
    # practice mode
    await nav(pg, 'Chapter practice')
    await pg.locator('.chapter-card', has=pg.locator('h3:has-text("Ancient Indian History")')).locator('button:has-text("Practise")').click()
    await pg.click('.modal .chip:text-is("5")'); await pg.click('.modal-foot button:has-text("Start practice")'); await pg.wait_for_timeout(400)
    for i in range(5):
        o = pg.locator('.exam-q .opt').first
        if await o.count(): await o.click()
        else: await pg.locator('.exam-q input.input').fill('Sarnath')
        await pg.click('button:has-text("Check answer")'); await pg.wait_for_timeout(100)
        if i < 4: await pg.click('button:has-text("Next question")')
    ok('practice mode gives instant feedback', await pg.locator('.exam .notice').count() == 1)
    await pg.click('button:has-text("Finish and see summary")'); await pg.wait_for_timeout(400)
    # 17 analytics reflect attempts
    await nav(pg, 'Dashboard')
    an = await ws(pg, "ws.attempts.filter(a=>a.userId===st.user.id&&a.status==='submitted').length")
    ok('17 dashboard reflects actual attempts', await pg.locator(f'.stat:has-text("Tests completed") .v:text-is("{an}")').count() == 1, an)
    ok('student pages render without errors', not pg.errs, pg.errs[:5])
    await ctx.close()

async def premium_journey(b):
    ctx, pg = await newpage(b)
    await pg.click('.demo-acct:has-text("Riya Sharma")'); await pg.wait_for_timeout(700)
    await pg.screenshot(path='/home/claude/e2e/student-home.png', full_page=True)
    ok('premium dashboard shows weakest topics', await pg.locator('text=Weakest topics').count() == 1 and await pg.locator('text=Delhi Sultanate').count() + await pg.locator('text=Mughal Empire').count() > 0)
    await nav(pg, 'Exam simulator')
    card = pg.locator('.card', has=pg.locator('h3:has-text("Prelims mini mock")')).first
    await card.locator('button:has-text("Start simulation")').click()
    await pg.check('.modal input[type=checkbox]'); await pg.click('button:has-text("I am ready to begin")'); await pg.wait_for_timeout(600)
    ok('simulator opens with palette and timer', await pg.locator('.palette-grid .pq').count() == 30 and await pg.locator('.timer').count() == 1)
    await pg.locator('.exam-q .opt').first.click(); await pg.click('button:has-text("Save & next")')
    await pg.click('button:has-text("Mark for review & next")'); await pg.wait_for_timeout(100)
    ok('palette statuses update', await pg.locator('.pq.answered').count() >= 2 and await pg.locator('.palette-grid .pq.marked').count() == 1)
    await pg.screenshot(path='/home/claude/e2e/sim.png')
    # expire: move start back past duration
    await ws(pg, "(()=>{const a=ws.attempts.find(a=>a.userId===st.user.id&&a.status==='in_progress'); a.startedAt -= 37*60000; return 1})()")
    await pg.wait_for_timeout(1500)
    auto = await ws(pg, "(()=>{const a=ws.attempts.filter(a=>a.userId===st.user.id).sort((x,y)=>y.startedAt-x.startedAt)[0]; return [a.status, a.autoSubmitted]})()")
    ok('12 auto-submit when time expires', auto == ['submitted', True] and await pg.locator('text=Time is up').count() == 1, auto)
    await pg.click('button:has-text("See my result")'); await pg.wait_for_timeout(500)
    ok('premium sees explanations', await pg.locator('.explain h4:has-text("Explanation")').count() > 0 and await pg.locator('text=Detailed explanations are included').count() == 0)
    # 18 admin change doesn't alter history
    qid = await ws(pg, "(()=>{const a=ws.attempts.filter(a=>a.userId===st.user.id&&a.status==='submitted').sort((x,y)=>y.submittedAt-x.submittedAt)[0]; return ws.papers.find(p=>p.id===a.paperId).sections[0].items[0].qid})()")
    oldtext = await ws(pg, f"ws.questions.find(q=>q.id==='{qid}').text")
    score_before = await ws(pg, "ws.attempts.filter(a=>a.userId===st.user.id&&a.status==='submitted').sort((x,y)=>y.submittedAt-x.submittedAt)[0].result.score")
    await pg.evaluate("window.__pk.S.demoLogin('admin@prashnakosh.demo')")
    await ws(pg, f"(()=>{{const q=JSON.parse(JSON.stringify(ws.questions.find(q=>q.id==='{qid}'))); q.text='EDITED BY ADMIN'; q.correct=[q.options.find(o=>!q.correct.includes(o.id)).id]; S.saveQuestion(q); return 1}})()")
    await pg.evaluate("window.__pk.S.demoLogin('student@prashnakosh.demo')")
    snap = await ws(pg, f"(()=>{{const a=ws.attempts.filter(a=>a.userId===st.user.id&&a.status==='submitted').sort((x,y)=>y.submittedAt-x.submittedAt)[0]; const it=ws.papers.find(p=>p.id===a.paperId).sections[0].items[0]; return [it.text, a.result.score]}})()")
    ok('18 admin edits do not alter completed attempts', snap[0] == oldtext and snap[1] == score_before, snap)
    # weak-area test + revision
    await nav(pg, 'Dashboard'); await pg.click('button:has-text("Generate a weak-area test")'); await pg.wait_for_timeout(600)
    ok('weak-area test generated and started', await pg.locator('.exam').count() == 1)
    await pg.click('.exam-top button:has-text("Pause")'); await pg.wait_for_timeout(300)
    await nav(pg, 'Revision'); await pg.click('button:has-text("Revise all")'); await pg.wait_for_timeout(400)
    ok('revision paper from mistakes and bookmarks', await pg.locator('.exam').count() == 1)
    ok('premium journeys without errors', not pg.errs, pg.errs[:5])
    await ctx.close()

async def mobile(b):
    ctx, pg = await newpage(b, mobile=True)
    await pg.screenshot(path='/home/claude/e2e/m-login.png')
    await pg.click('.demo-acct:has-text("Riya Sharma")'); await pg.wait_for_timeout(700)
    await pg.screenshot(path='/home/claude/e2e/m-home.png', full_page=True)
    sw = await pg.evaluate('document.documentElement.scrollWidth')
    ok('20 mobile: no horizontal overflow on dashboard', sw <= 390, sw)
    await pg.click('.tabbar button:has-text("Create")'); await pg.wait_for_timeout(300)
    await pg.screenshot(path='/home/claude/e2e/m-create.png', full_page=True)
    sw = await pg.evaluate('document.documentElement.scrollWidth'); ok('20 mobile: create page fits', sw <= 390, sw)
    await pg.click('.tabbar button:has-text("Tests")'); await pg.click('[role=tab]:has-text("Assigned")'); await pg.wait_for_timeout(200)
    await pg.locator('button:has-text("Start")').first.click(); await pg.wait_for_timeout(600)
    await pg.locator('.exam-q .opt').first.click()
    await pg.screenshot(path='/home/claude/e2e/m-exam.png')
    await pg.click('.exam-foot button.mobile-only'); await pg.wait_for_timeout(200)
    ok('20 mobile: palette opens as a sheet', await pg.locator('.exam-palette.open').is_visible())
    await pg.screenshot(path='/home/claude/e2e/m-palette.png')
    await pg.click('button[aria-label="Close palette"]')
    await pg.click('.exam-foot button:has-text("Save & next")')
    ok('mobile without errors', not pg.errs, pg.errs[:5])
    await ctx.close()

async def main():
    which = sys.argv[1:] or ['admin','student','premium','mobile']
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for w in which:
            try: await {'admin':admin_journey,'student':student_journey,'premium':premium_journey,'mobile':mobile}[w](b)
            except Exception as e: ok(f'{w} journey crashed', False, str(e)[:600])
        await b.close()
    f=[r for r in results if not r[1]]
    print(f'\n{len(results)-len(f)}/{len(results)} passed')
asyncio.run(main())
