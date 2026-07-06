/* extras.js - end-of-tour quiz.
   Self-contained, dependency-free, boots on DOMContentLoaded. It only touches
   elements inside #tour-quiz; station modules and main.js see nothing of it.

   Wiring: each .quiz-q carries data-correct="<letter>"; each .quiz-choice
   carries data-choice="<letter>". First click on any choice locks the question
   (marks the right answer, marks the click if wrong, reveals the explanation). */

function wireQuiz(root) {
  const questions = root.querySelectorAll('.quiz-q');
  questions.forEach(q => {
    const correct = q.dataset.correct;
    const choices = q.querySelectorAll('.quiz-choice');
    choices.forEach(btn => {
      btn.addEventListener('click', () => {
        if (q.classList.contains('answered')) return;
        q.classList.add('answered');
        choices.forEach(c => {
          c.disabled = true;
          if (c.dataset.choice === correct) c.classList.add('correct');
        });
        if (btn.dataset.choice !== correct) btn.classList.add('wrong');
      });
    });
  });
}

function boot() {
  const quiz = document.getElementById('tour-quiz');
  if (quiz) wireQuiz(quiz);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
