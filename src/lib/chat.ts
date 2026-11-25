/**
 * The conversational layer of the assistant (سراج): it tells a social message (a greeting, thanks, a blessing, «جعلني فداك», how are you, who are you, a joke, a sad word …)
 * from a question about the books, so a kind word is answered kindly instead of being searched in the references.
 * It only CLASSIFIES (rule-based, offline, nothing leaves the phone); the words of every reply live in the content (data/assistant/phrases.json, categories `chat_*` / `pre_*`).
 * A message that is a greeting followed by a real question («السلام عليكم، وش تفسير الماء») gives `rest`: the question, to be answered after a short greeting.
 */
import { normalize } from './arabic';

export type Social =
  | 'crisis' | 'sad' | 'frustrated' | 'salam' | 'morning' | 'evening' | 'night' | 'blessing' | 'greet' | 'howare' | 'howare_ans'
  | 'fida' | 'dua' | 'thanks' | 'praise' | 'love' | 'sorry' | 'bye' | 'who' | 'self' | 'name_set' | 'name_ask' | 'laugh' | 'ack' | 'latin'
  | 'welcome' | 'miss' | 'joke' | 'chat' | 'wait' | 'lost' | 'dream_start';
export interface SocialHit { intents: Social[]; rest: string; name?: string; }

const n = (s: string) => normalize(s);
const squash = (s: string) => s.replace(/ـ/g, '').replace(/([ء-ي])\1{2,}/g, '$1').replace(/(ا)\1+/g, '$1').replace(/(ي)\1+/g, '$1').replace(/(و)\1{1,}/g, '$1');
/** the form in which lexicon words and messages are compared: normalised AND with stretched letters squeezed (so «ملايين» and «ملاين» are the same) */
const nn = (s: string) => n(squash(s));
const alt = (xs: string[]) => '(?:' + [...new Set(xs.map(nn).filter(Boolean))].sort((a, b) => b.length - a.length).join('|') + ')';

/** the phrases of every kind of social message (written naturally; matched after normalising both sides) */
const LEX: Record<Exclude<Social, 'laugh' | 'latin' | 'name_set'>, string[]> = {
  crisis: ['انتحر', 'ابغى اموت', 'ابي اموت', 'ابغا اموت', 'اقتل نفسي', 'ابغى اقتل نفسي', 'ودي اموت', 'ودي انتحر', 'اذي نفسي', 'ما ابغى اعيش', 'ما ابي اعيش', 'كرهت حياتي', 'تعبت من الحياه', 'اتمنى اموت'],
  sad: ['تعبان', 'تعبانه', 'زعلان', 'زعلانه', 'حزين', 'حزينه', 'مكتئب', 'مكتئبه', 'ضايق', 'ضايقه', 'ضايق صدري', 'قلقان', 'قلقانه', 'خايف', 'خايفه', 'مهموم', 'مهمومه', 'محبط', 'محبطه', 'يائس', 'نفسيتي تعبانه', 'نفسيتي سيئه', 'مو مرتاح', 'ما ارتاح', 'احس بضيق', 'احس اني تعبان', 'مليت', 'زهقان', 'زهقت', 'ضاقت فيني الدنيا', 'همي كبير'],
  frustrated: ['غبي', 'حمار', 'ما تفهم', 'ما فهمت علي', 'ما فهمتني', 'ما تفهمني', 'ما تعرف شي', 'سخيف', 'فاشل', 'ما نفعتني', 'ما فدتني', 'ما جاوبتني', 'ما اجبت', 'جوابك غلط', 'جوابك خطا', 'غلط', 'مو صح', 'خربان', 'ما تنفع', 'ما فيك فايده', 'ما تفيد', 'ما فهمت جوابك', 'تكلم عدل'],
  salam: ['سلامو عليكم', 'سلاموا عليكم', 'سلام الله عليكم ورحمته', 'السلام عليكم', 'السلام عليكم ورحمه الله', 'السلام عليكم ورحمه الله وبركاته', 'سلام عليكم', 'سلام الله عليكم', 'سلام عليكم ورحمه الله وبركاته', 'ورحمه الله وبركاته', 'عليكم السلام', 'وعليكم السلام', 'وعليكم السلام ورحمه الله وبركاته'],
  morning: ['صباح الخير', 'صباح النور', 'صباح الفل', 'صباح الورد', 'صباحو', 'اسعد الله صباحك', 'صباحك سكر', 'صباح الخيرات', 'يوم سعيد', 'نهارك سعيد', 'نهارك زين'],
  evening: ['مساء الخير', 'مساء النور', 'مساء الفل', 'مساء الورد', 'مساك الله بالخير', 'اسعد الله مساءك', 'مساكم الله بالخير', 'مساء الخيرات', 'مساء الانوار'],
  night: ['تصبح على خير', 'تصبحون على خير', 'تصبحين على خير', 'نوم العوافي', 'عمت مساء', 'ليله سعيده', 'ليلتك سعيده', 'اروح انام', 'بنام', 'ابغى انام', 'اذهب للنوم', 'طابت ليلتك', 'طابت لياليكم'],
  blessing: ['كل عام وانتم بخير', 'كل عام وانت بخير', 'عيد مبارك', 'عيدكم مبارك', 'رمضان كريم', 'رمضان مبارك', 'جمعه مباركه', 'جمعتك مباركه', 'تقبل الله', 'تقبل الله منا ومنكم', 'عساكم من عواده', 'عيد سعيد', 'شهر مبارك', 'مبروك', 'الف مبروك', 'عقبال'],
  greet: ['ياهلا', 'ياهلا ومسهلا', 'يامرحبا', 'يا مرحبا ومسهلا', 'هلا', 'هلا والله', 'هلا وغلا', 'هلا فيك', 'هلا بك', 'هلا بيك', 'هلا بالطيب', 'هلا بالغالي', 'يا هلا', 'يا هلا والله', 'يا هلا ومرحبا', 'اهلا', 'اهلا وسهلا', 'اهلين', 'اهلا بك', 'اهلا فيك', 'مرحبا', 'مرحبتين', 'مرحبا بك', 'يا مرحبا', 'هلو', 'هاي', 'هايف', 'حياك الله', 'حياك', 'حياكم الله', 'حياكم', 'يا حيا الله', 'يا حياك', 'سلامات', 'اهلا ومرحبا', 'اهلا بالطيب', 'يا اهلا', 'هلا هلا', 'مرحبا مرحبا', 'ابشر'],
  howare: ['كيفك', 'كيف حالك', 'كيف الحال', 'كيف الاحوال', 'كيف حالكم', 'كيف الصحه', 'شلونك', 'شلونكم', 'شخبارك', 'شخباركم', 'وش اخبارك', 'ايش اخبارك', 'شو اخبارك', 'وش علومك', 'علومك', 'اخبارك', 'وش الاخبار', 'كيف امورك', 'كيف يومك', 'وش مسويلنا', 'كيفك اليوم', 'كيف صحتك', 'طمني عنك', 'عساك طيب', 'عساك بخير', 'عساك بخير ان شاء الله', 'عساكم بخير'],
  howare_ans: ['الحمد لله', 'الحمدلله', 'الحمد لله تمام', 'تمام الحمد لله', 'بخير الحمد لله', 'بخير', 'تمام التمام', 'طيب والحمد لله', 'الحمد لله بخير', 'الحمد لله طيب', 'الحمد لله على كل حال', 'الحمد لله دائما', 'الحمد لله زين', 'زين الحمد لله'],
  fida: ['جعلني فدا لك', 'جعلني الله فدا لك', 'جعلني فدا', 'جعلني الله فداك', 'جعلني فداك', 'جعلني الله فدا', 'فداك', 'فدا', 'فديتك', 'الله يفداك', 'جعلني فدى', 'فدوه', 'تفداك روحي', 'روحي فداك', 'نفسي فداك'],
  dua: ['الله يحفظك', 'الله يحفظك ويرعاك', 'الله يسلمك', 'الله يوفقك', 'الله يبارك فيك', 'بارك الله فيك', 'بارك الله فيكم', 'الله يرفع قدرك', 'الله يخليك', 'الله يسعدك', 'الله يكرمك', 'الله يعافيك', 'الله يهديك', 'الله يرزقك', 'الله يزيدك علم', 'الله يزيدك من فضله', 'الله يجعلك ذخر', 'الله يجعل ذلك في ميزان حسناتك', 'الله يجعله في ميزان حسناتك', 'في ميزان حسناتك', 'اللهم بارك', 'اللهم احفظه', 'احسن الله اليك', 'احسن الله اليكم', 'وفقك الله', 'حفظك الله', 'سلمك الله', 'رعاك الله', 'ايدك الله', 'ايدك الله ونصرك', 'نفع الله بك', 'الله ينفع بك', 'نفعك الله', 'اثابك الله', 'اجرك الله', 'اجزل الله مثوبتك', 'الله ما يحرمنا منك', 'الله لا يحرمنا منك', 'ما حرمنا الله منك', 'الله يطول عمرك', 'الله يجزاك الجنه', 'الله يرضى عليك', 'رضي الله عنك', 'تسلم يدينك', 'تسلم يمينك', 'يسلم راسك', 'الله يعطيك الف عافيه', 'ادام الله عزك', 'ادام الله فضلك'],
  thanks: ['شكر', 'ماقصرت', 'ماقصرت يا غالي', 'شكرا', 'شكرا لك', 'شكرا جزيلا', 'شكرا جزيلا لك', 'شكراً', 'شكرا كثير', 'شكرا لك يا سراج', 'مشكور', 'مشكوره', 'مشكورين', 'يعطيك العافيه', 'الله يعطيك العافيه', 'يعطيك الف عافيه', 'جزاك الله خير', 'جزاك الله خيرا', 'جزاكم الله خيرا', 'جزاك الله', 'الله يجزاك خير', 'الله يجزيك الخير', 'الله يجزيك خير', 'جزاك الله كل خير', 'تسلم', 'تسلم يا غالي', 'يسلمو', 'يسلموا', 'ما قصرت', 'ما قصرت والله', 'ما قصرت يا غالي', 'كفيت ووفيت', 'كفيت', 'وفيت', 'اشكرك', 'اشكرك على', 'ممنون', 'ممنونك', 'متشكر', 'متشكرين', 'thx', 'thanks', 'thank you', 'يعطيك الف عافيه', 'تشكر', 'شكر الله لك', 'عساك على القوه', 'الله لا يحرمنا', 'عافاك الله'],
  praise: ['ممتاز', 'رائع', 'روعه', 'حلو', 'حلوه', 'جميل', 'جميله', 'احسنت', 'احسنتم', 'ما شاء الله', 'ماشاء الله', 'ما شاء الله عليك', 'تبارك الله', 'كفو', 'كفو والله', 'ابدعت', 'مبدع', 'عبقري', 'ذكي', 'شاطر', 'زين', 'فنان', 'يا سلام', 'الله عليك', 'الله الله', 'برافو', 'تسلم ايدك', 'انت رهيب', 'رهيب', 'خرافي', 'اسطوره', 'ممتاز جدا', 'كلامك حلو', 'اسلوبك حلو', 'اعجبني', 'اعجبتني', 'اعجبني ردك', 'نفعتني', 'استفدت', 'استفدت منك', 'افدتني', 'احسنت يا سراج', 'ما شاء الله تبارك الله', 'صح لسانك', 'صح لسانك يا غالي', 'ولا غلطه', 'ولا غلطه والله', 'اجابه ممتازه', 'جواب ممتاز', 'جواب حلو', 'جوابك حلو'],
  love: ['احبك', 'احبك في الله', 'احبك يا سراج', 'احبكم', 'حبيتك', 'حبيبي', 'يا حبيبي', 'يا قلبي', 'يا روحي', 'عشقتك'],
  sorry: ['اسف', 'اسفه', 'آسف', 'عذرا', 'اعتذر', 'سامحني', 'سامحيني', 'معليش', 'معذره', 'اعذرني', 'لا تواخذني', 'ما قصدت', 'غلطت', 'عفوا', 'العفو'],
  bye: ['مع السلامه', 'مع السلامه يا غالي', 'في امان الله', 'في امان الله وحفظه', 'الى اللقاء', 'الي اللقاء', 'باي', 'باي باي', 'بسلامه', 'استودعك الله', 'استودعتك الله', 'نشوفك على خير', 'اشوفك على خير', 'الله معك', 'الله يحفظك ويسلمك ومع السلامه', 'يالله باي', 'يلا باي', 'يلا مع السلامه', 'اشوفك بعدين', 'اكلمك بعدين', 'اراك لاحقا', 'خلاص يكفي', 'كفايه كذا', 'بروح', 'بمشي', 'اتركك', 'سلامتك', 'الله يسلمك ومع السلامه'],
  who: ['من انت', 'مين انت', 'منو انت', 'وش انت', 'ايش انت', 'شو انت', 'انت مين', 'انت من', 'انت منو', 'وش اسمك', 'ايش اسمك', 'شو اسمك', 'ما اسمك', 'اسمك ايش', 'اسمك وش', 'اسمك منو', 'اسمك ايه', 'وش تسمى', 'ايش تسمى', 'عرفني بنفسك', 'عرف بنفسك', 'عرفنا بنفسك', 'تعرف بنفسك', 'عرف نفسك', 'قل لي من انت', 'قولي من انت', 'مين سراج', 'من سراج', 'منو سراج', 'وش سراج', 'ايش سراج', 'انت سراج', 'اسمك سراج', 'هل اسمك سراج', 'من صنعك', 'من صممك', 'من برمجك', 'من سواك', 'من عملك', 'من صاحبك', 'من مطورك', 'مين صنعك', 'مين برمجك', 'مين سواك', 'انت بشر', 'انت انسان', 'انت روبوت', 'انت ذكاء اصطناعي', 'انت ذكاء', 'انت ادمي', 'انت حقيقي', 'انت شخص', 'مع من اتكلم', 'من معي', 'مين معي', 'مين معاي', 'مين معايا', 'من معايا', 'ايش وظيفتك', 'وش وظيفتك', 'وش شغلتك', 'ايش شغلتك', 'وش تشتغل', 'ايش تشتغل', 'وش فايدتك', 'ايش فايدتك', 'وش تسوي', 'ايش تسوي', 'وش تقدر تسوي', 'ايش تقدر تسوي', 'وش تقدر', 'ايش تقدر', 'وش تعرف', 'ايش تعرف', 'وش ممكن اسالك', 'ايش ممكن اسالك', 'كيف استخدمك', 'كيف اسالك', 'كيف اتعامل معك', 'كيف تشتغل', 'كيف اشتغل معك', 'مساعده', 'ساعدني', 'ابغى مساعده', 'ابي مساعده', 'عندي سؤال', 'ابغى اسال', 'ابي اسال', 'ممكن اسال', 'ممكن سؤال', 'اقدر اسال', 'اقدر اسالك', 'ابغى استفسر', 'ابي استفسر', 'استفسار', 'تقدر تساعدني', 'تقدر تساعد', 'ممكن مساعده', 'وش اقدر اسالك'],
  self: ['كم عمرك', 'وين تسكن', 'وين بيتك', 'من وين انت', 'انت ولد ولا بنت', 'انت رجال ولا حرمه', 'انت ذكر ولا انثى', 'تحبني', 'تحب', 'تاكل', 'تنام', 'تتعب', 'انت حي', 'انت مسلم', 'ايش دينك', 'وش دينك', 'انت سعودي', 'ايش تحب', 'وش تحب', 'وش هوايتك', 'عندك اصدقاء', 'انت وحيد', 'تحس', 'عندك مشاعر', 'انت تفهم', 'انت ذكي', 'تتكلم عربي', 'تعرف عربي', 'تتكلم انجليزي', 'تعرف انجليزي', 'وش لونك', 'عندك اهل', 'انت تتعلم', 'تتعلم مني', 'تتذكرني', 'تذكرني', 'تعرفني'],
  name_ask: ['وش اسمي', 'ايش اسمي', 'شو اسمي', 'تعرف اسمي', 'تذكر اسمي', 'ما اسمي', 'اسمي ايش', 'اسمي وش', 'تعرف مين انا', 'تعرف من انا', 'من انا', 'مين انا'],
  welcome: ['مرحبلي', 'رحبلي', 'رحب بي', 'رحب فيني', 'رحبوا بي', 'رحبوا فيني', 'قل مرحبا', 'قولي مرحبا', 'قول مرحبا', 'قل هلا', 'قولي هلا', 'ابغى ترحيب', 'ابي ترحيب', 'ابغى ترحب بي', 'مرحبا بي', 'هلا بي', 'اهلا بي', 'يا هلا بي', 'رحب بالضيف', 'استقبلني', 'استقبلوني', 'حيني', 'حييني'],
  miss: ['اشتقنا لك', 'اشتقت لك', 'اشتقت لكم', 'اشتقنا', 'وحشتني', 'وحشتنا', 'وينك', 'وينكم', 'وينك من زمان', 'من زمان', 'من زمان ما شفناك', 'ما شفناك', 'غبت علينا', 'غيبتك طالت', 'مشتاق لك', 'مشتاقين لك', 'افتقدتك', 'افتقدناك', 'سلامات من زمان', 'وين الغيبه'],
  joke: ['قل لي نكته', 'قولي نكته', 'قول نكته', 'نكته', 'عندك نكته', 'ضحكني', 'ضحكنا', 'خبرني شي مضحك', 'قل شي مضحك', 'قول شي يضحك', 'عندك طرفه', 'طرفه', 'قل لي طرفه', 'مزح', 'تمزح', 'امزح معي'],
  chat: ['سولف معي', 'سولف', 'تعال نسولف', 'ابغى اسولف', 'ابي اسولف', 'نسولف', 'تحب نسولف', 'وش الجديد', 'ايش الجديد', 'وش عندك', 'ايش عندك', 'وش عندك جديد', 'قل لي شي', 'قولي شي', 'تكلم معي', 'كلمني', 'تبغى نسولف', 'ابغى سوالف', 'وش اخبار الدنيا', 'وش سوالفك', 'شو سوالفك', 'وش مسوي', 'ايش مسوي', 'وش تسوي الحين', 'ايش تسوي الحين', 'وش تسوي الحين', 'انت فاضي', 'تفضى'],
  wait: ['لحظه', 'لحظه من فضلك', 'ثواني', 'ثانيه', 'ثانيه وحده', 'استنى', 'انتظر', 'انتظرني', 'لحظات', 'دقيقه', 'دقيقه وارجع', 'برجع', 'ارجع لك', 'ارجع لك بعدين', 'لحظه واجي'],
  lost: ['ما ادري', 'مدري', 'ما ادري وش اسال', 'ما اعرف وش اسال', 'محتار', 'محتاره', 'احتار', 'ما اعرف', 'ما اعرف شي', 'وش اسال', 'ايش اسال', 'وش اقول', 'ايش اقول', 'ما عندي سؤال', 'ما اعرف من وين ابدا', 'من وين ابدا', 'من وين اتي', 'وين ابدا', 'ابغى اعرف', 'ابي اعرف', 'بغيت اعرف', 'ودي اعرف', 'اريد ان اعرف', 'ابغى اتعلم', 'ابي اتعلم', 'علمني', 'وش اتعلم', 'ايش اتعلم'],
  dream_start: ['عندي حلم', 'عندي رويا', 'عندي حلم ابغى تفسيره', 'عندي رويا ابغى تفسيرها', 'ابغى اعبر رويا', 'ابغى تعبير رويا', 'ابغى تفسير حلم', 'ابغى تفسير حلمي', 'ابي تفسير حلم', 'ابي تفسير رويا', 'شفت حلم', 'شفت رويا', 'شفت منام', 'رايت حلم', 'رايت رويا', 'حلمت بحلم', 'شفت حلم غريب', 'حلمت حلم غريب', 'تعبر لي حلم', 'تعبر حلم', 'تفسر حلم', 'تفسر لي حلم', 'تعبرلي', 'عبر لي حلمي', 'فسر لي حلمي', 'ابغى اسال عن حلم', 'ابي اسال عن حلم', 'ابغى اسال عن رويا', 'ابي اسال عن رويا', 'عندي سؤال عن حلم', 'عندي سؤال عن رويا', 'عندي سؤال في التعبير', 'عندي سؤال عن التعبير'],
  ack: ['تمام', 'اوكي', 'اوكيه', 'ok', 'okay', 'طيب', 'ماشي', 'حاضر', 'زين', 'تم', 'حسنا', 'حسنا تمام', 'يالله', 'ايوه', 'ايه', 'اي', 'نعم', 'اها', 'اهه', 'اه', 'فهمت', 'تمام فهمت', 'واضح', 'مفهوم', 'تمام واضح', 'ان شاء الله', 'انشالله', 'ان شاء الله خير', 'بإذن الله', 'باذن الله', 'سمعا وطاعه', 'ولا يهمك', 'ولا يهمك والله', 'لا بأس', 'ولا شي', 'لا شي', 'ما شي', 'مافي شي', 'ولا شيء', 'لا شيء', 'عادي', 'ولا يهمك عادي', 'لا', 'كلا', 'لا شكرا', 'لا شكرا لك', 'يكفي', 'هذا كل شي', 'هذا كل شيء', 'بس', 'بس كذا', 'بس هذا', 'لا بس', 'تمام بس'],
};
// «جوابك ممتاز»، «ردك حلو»، «كلامك غلط»: whatever the user points at (the answer, the app …) + how he finds it
const AT = ['جوابك', 'ردك', 'كلامك', 'اسلوبك', 'شرحك', 'اجابتك', 'عملك', 'برنامجك', 'تطبيقك', 'التطبيق', 'الجواب', 'الرد', 'الشرح', 'الاجابه', 'الاسلوب', 'هذا التطبيق', 'هالتطبيق', 'هذا الجواب', 'هالجواب'];
for (const a of AT) {
  for (const g of ['ممتاز', 'ممتازه', 'حلو', 'حلوه', 'رائع', 'جميل', 'مفيد', 'واضح', 'زين', 'روعه', 'تمام', 'كفو', 'يجنن', 'يفتح النفس', 'عجبني', 'اعجبني', 'افادني', 'نفعني']) LEX.praise.push(`${a} ${g}`);
  for (const b of ['غلط', 'خطا', 'سيء', 'سيئ', 'مو صح', 'ما عجبني', 'ما اعجبني', 'مو واضح', 'ما يفيد', 'ما نفعني', 'ما افادني', 'ناقص']) LEX.frustrated.push(`${a} ${b}`);
}

const FILLER = new Set(['يا', 'سراج', 'سراجنا', 'سراجي', 'غالي', 'الغالي', 'طيب', 'الطيب', 'اخي', 'اخوي', 'اخويا', 'شيخ', 'استاذ', 'حبيبي', 'حبي', 'صديقي', 'والله', 'بالله', 'لك', 'علينا', 'عليك', 'فيك', 'فيكم', 'عليكم', 'لنا', 'عن', 'طال', 'عمرك', 'ابو', 'بس', 'كذا', 'يعني', 'ان', 'شاء', 'الله', 'اللهم', 'امين', 'آمين', 'ي', 'يا اخي', 'ورحمه', 'وبركاته', 'و', 'انت', 'انا', 'نحن', 'هذا', 'هذه', 'ذا', 'جدا', 'كثير', 'مره', 'والله العظيم', 'اليوم', 'الان', 'الحين', 'ترا', 'ترى', 'فعلا', 'صراحه', 'حقيقه', 'ايضا', 'برضو', 'كمان', 'وانت', 'وانتم', 'انتم', 'منك', 'منكم', 'له', 'لها', 'هو', 'هي', 'يا ريت', 'ريت', 'يارب', 'رب', 'ما', 'مو', 'مب', 'لا', 'ملايين', 'مليون', 'بالملايين', 'الف', 'الاف', 'بالالف', 'مئه', 'مره', 'مرات', 'مرتين', 'وايد', 'واجد', 'كتير', 'اوي', 'قوي', 'بشده', 'تماما', 'خالص', 'كل', 'دايم', 'دايما', 'دوم', 'الله يخليك', 'لو سمحت', 'من فضلك', 'تكرم', 'ياخي', 'ياسراج', 'اخوي', 'اختي', 'ابوي', 'امي', 'عمي', 'خالي', 'يابعد', 'بعد', 'يبه', 'يمه', 'ياشيخ', 'ياغالي', 'ياطيب', 'يالغالي', 'ياحبيبي', 'شوي', 'شويه', 'قليلا', 'لي', 'لنا', 'الرحمه', 'رحمه', 'مسهلا', 'وسهلا', 'سهلا', 'ويا', 'بيك', 'بك', 'بكم'].map(nn));
const FILLER_RE = new Set([...FILLER]);
/** a filler word, alone or with a one-letter clitic in front («ومليون»، «بالغالي»، «ويا») */
const isFiller = (w: string) => FILLER_RE.has(w) || (w.length > 2 && 'وبلف'.includes(w[0]) && (FILLER_RE.has(w.slice(1)) || (w.startsWith('بال') && FILLER_RE.has(w.slice(3))) || (w.startsWith('ال') === false && false)));

const PRIORITY: Social[] = ['crisis', 'sad', 'frustrated', 'name_ask', 'dream_start', 'lost', 'who', 'self', 'welcome', 'miss', 'joke', 'chat', 'wait', 'salam', 'morning', 'evening', 'night', 'blessing', 'greet', 'howare', 'howare_ans', 'fida', 'dua', 'love', 'thanks', 'praise', 'sorry', 'bye', 'ack'];
/** kinds of social message that may come in front of a real question («وعليكم السلام، وش تفسير الماء؟») */
const PREFIX: Social[] = ['salam', 'morning', 'evening', 'greet', 'welcome', 'thanks', 'dua', 'fida', 'blessing', 'sorry', 'howare_ans'];
/** kinds that may be said together in one message and answered in one reply («السلام عليكم، كيفك؟») */
const COMBINE: Social[] = ['salam', 'morning', 'evening', 'greet', 'welcome', 'miss', 'howare', 'howare_ans', 'thanks', 'dua', 'fida', 'praise', 'blessing', 'love'];

const RES = PRIORITY.map((k) => [k, new RegExp('(?:^| )' + alt(LEX[k as keyof typeof LEX]) + '(?= |$)', 'g')] as const);

// ---------- fuzzy words ----------
/** every word the lexicon uses (the words a variant is brought to) */
const FUZZY_KINDS = ['salam', 'morning', 'evening', 'night', 'blessing', 'greet', 'welcome', 'miss', 'howare', 'howare_ans', 'fida', 'dua', 'thanks', 'love', 'sorry', 'bye'];
const VOCAB = new Set<string>(); for (const k of FUZZY_KINDS) for (const ph of LEX[k as keyof typeof LEX]) for (const w of nn(ph).split(' ')) if (w.length >= 4) VOCAB.add(w);
const lev = (a: string, b: string): number => {
  const m = a.length, k = b.length; if (Math.abs(m - k) > 2) return 9;
  let prev = Array.from({ length: k + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= k; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[k];
};
/** the closest lexicon word to `w`: the same stem with a short ending («مرحبلي» ~ «مرحبا»), or one letter away; nothing when two words are equally close */
function nearest(w: string): string | undefined {
  let best: string | undefined; let score = 99; let tie = false;
  for (const v of VOCAB) {
    let cp = 0; while (cp < w.length && cp < v.length && w[cp] === v[cp]) cp++;
    const stem = cp >= 4 && w.length - cp <= 3 && v.length - cp <= 3 ? 1 + Math.abs(w.length - v.length) * 0.1 : 99;
    const d = Math.min(stem, Math.min(w.length, v.length) >= 6 ? lev(w, v) : 99);
    if (d < 2 && d <= score) { if (d === score && v !== best) tie = true; else tie = false; score = d; best = v; }
  }
  return tie ? undefined : best;
}

const LATIN: [RegExp, Social][] = [[/^(?:hi+|hello+|hey+|hola|yo|good (?:morning|evening|afternoon)|salam|salaam|assalam(?:u)? ?alaikum|as-?salamu? ?alaykum)\b/, 'greet'], [/^(?:thanks?|thank you|thx|tnx|ty|shukran|jazak)\b/, 'thanks'], [/^(?:bye|goodbye|see you|cya)\b/, 'bye'], [/^(?:ok+|okay|k|fine|cool|nice)\b/, 'ack'], [/^(?:who are you|what is your name|your name)\b/, 'who'], [/^(?:how are you|how r u|hru)\b/, 'howare']];

/** classifies a message as social (or null when it is about the books). `name` is set when the user tells their name. */
/** `known(flat)` tells whether the message is a word of the symbols dictionary (a dream symbol such as «حمار»): a short message that is only that is a question, not small talk. */
export function smalltalk(raw: string, known?: (flat: string) => boolean, fuzzy = true): SocialHit | null {
  const hit = smalltalkRaw(raw, fuzzy);
  if (!hit || hit.rest) return hit;
  if (known && hit.intents.every((k) => !CORE.includes(k))) { const flat = nn(raw); if (flat && flat.split(' ').length <= 3 && known(flat)) return null; }
  return hit;
}
/** the greetings that nobody asks about as a symbol: they stay greetings even if the dictionary has the word */
const CORE: Social[] = ['ack', 'salam', 'greet', 'welcome', 'thanks', 'bye', 'howare', 'dua', 'fida', 'morning', 'evening', 'night', 'miss', 'blessing'];
function smalltalkRaw(raw: string, fuzzy: boolean): SocialHit | null {
  const text = raw.trim(); if (!text) return null;
  // not Arabic at all: laughter, hearts, thumbs, or a short Latin greeting
  if (!/[ء-ي]/.test(text)) {
    const low = text.toLowerCase();
    if (/😂|🤣|😆|😅|😹|lol|haha|xd/u.test(low)) return { intents: ['laugh'], rest: '' };
    if (/[❤💖🌹🥰😍💕🌷💐🤍💚]/u.test(text)) return { intents: ['love'], rest: '' };
    if (/[👍👌✅🙂😊☺]/u.test(text)) return { intents: ['ack'], rest: '' };
    if (/🙏|🤲/u.test(text)) return { intents: ['dua'], rest: '' };
    if (/[😢😭😔😞☹😟😥]/u.test(text)) return { intents: ['sad'], rest: '' };
    if (/[a-z]/.test(low)) { for (const [re, k] of LATIN) if (re.test(low)) return { intents: [k], rest: '' }; return { intents: ['latin'], rest: '' }; }
    return null;
  }
  // laughter written in Arabic letters, and a bare «سلام»
  const letters = text.replace(/[^ء-ي]/g, '');
  if (/^ه{3,}$/.test(letters) || /^(?:ها){2,}ه?$/.test(letters)) return { intents: ['laugh'], rest: '' };
  if (/^(?:ال)?سلام$/.test(n(letters))) return { intents: ['salam'], rest: '' };
  const mine = /(?:^|\s)(?:اسمي|انا اسمي|اسمي انا|ناديني|نادني|سمني)\s+([ء-ي]{2,15})(?:\s|$)/.exec(squash(text).replace(/[ًٌٍَُِّْ]/g, ''));
  if (mine && !FILLER_RE.has(n(mine[1])) && !/^(?:ايش|وش|شو|مين|منو|ماذا)$/.test(n(mine[1]))) return { intents: ['name_set'], rest: '', name: mine[1] };
  const flat = nn(text); if (!flat) return null;
  const exact = classifyFlat(flat);
  if (exact) return exact;
  // second chance for the many ways a Saudi says the same kind word («مرحبلي ملايين»، «هلاااا وغلاااا»، «شكرااا يا غالي»): each unknown word of a SHORT message is brought to the nearest word the
  // lexicon knows (same stem / one letter away), and the message is taken as social only if everything it says is then a kind word. A real question always keeps a word the lexicon does not know.
  if (!fuzzy) return null;
  const toks = flat.split(' ');
  if (toks.length > 7) return null;
  const mapped = toks.map((w) => (VOCAB.has(w) || isFiller(w) || w.length < 4 ? w : nearest(w) ?? w)).join(' ');
  if (mapped === flat) return null;
  const hit = classifyFlat(mapped);
  return hit && !hit.rest ? hit : null;
}

/** the classification of one normalised message (exact phrases of the lexicon) */
function classifyFlat(flat: string): SocialHit | null {
  const spans: { k: Social; s: number; e: number }[] = [];
  let work = ' ' + flat + ' ';
  // longest phrase first across kinds: take every match, then drop matches that sit inside a longer one
  const all: { k: Social; s: number; e: number }[] = [];
  for (const [k, re] of RES) { re.lastIndex = 0; let m: RegExpExecArray | null; while ((m = re.exec(work))) { const s = m.index + (m[0].startsWith(' ') ? 1 : 0); all.push({ k, s, e: m.index + m[0].length }); if (m[0].length === 0) re.lastIndex++; } }
  all.sort((a, b) => (b.e - b.s) - (a.e - a.s) || PRIORITY.indexOf(a.k) - PRIORITY.indexOf(b.k));
  for (const a of all) if (!spans.some((x) => a.s < x.e && x.s < a.e)) spans.push(a);
  if (!spans.length) return null;
  spans.sort((a, b) => a.s - b.s);
  let left = ''; let at = 0; for (const sp of spans) { left += work.slice(at, sp.s) + ' '; at = sp.e; } left += work.slice(at);
  const rest = left.split(/\s+/).filter((w) => w && !isFiller(w));
  const kinds = [...new Set(spans.map((x) => x.k))];
  const top = PRIORITY.find((k) => kinds.includes(k))!;
  if (rest.length === 0) {
    // «لا» / «بس» / «تمام» next to a real greeting or thanks is only an acknowledgment: let the warmer kind win
    const order = kinds.includes('crisis') ? ['crisis'] as Social[] : kinds.includes('sad') ? ['sad'] as Social[] : kinds.includes('frustrated') ? ['frustrated'] as Social[] : null;
    if (order) return { intents: order, rest: '' };
    const lone = kinds.filter((k) => k !== 'ack' || kinds.length === 1);
    if (lone.every((k) => COMBINE.includes(k))) return { intents: lone.slice(0, 2), rest: '' };
    return { intents: [PRIORITY.find((k) => lone.includes(k))!], rest: '' };
  }
  // a real question follows a greeting / thanks / blessing: answer both
  const first = spans[0];
  if (PREFIX.includes(first.k) && PRIORITY.indexOf(top) >= 0 && kinds.every((k) => PREFIX.includes(k) || k === 'howare') && rest.length >= 1) return { intents: [first.k], rest: rest.join(' ') };
  return null;
}
