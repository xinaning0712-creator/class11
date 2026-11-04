// 同事版的考試設定頁：和班網後台用同一份程式，資料只存在這台電腦
import { init, load } from './admin-exam.js?v=202611041352';
import { localDb } from './exam-local.js?v=202611041352';

init(localDb);
load();
