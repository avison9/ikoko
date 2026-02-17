from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request

from app.config import settings
from app.models import Child, Collaborator, Comment, Parent, ParentView, Reaction, User


class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        username = form.get("username")
        password = form.get("password")
        if (
            username == settings.admin_username
            and password == settings.admin_password
        ):
            request.session.update({"token": "authenticated"})
            return True
        return False

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        return request.session.get("token") == "authenticated"


class UserAdmin(ModelView, model=User):
    column_list = [User.id, User.full_name, User.email, User.username, User.country, User.profile_picture, User.created_at]
    column_searchable_list = [User.username, User.email, User.full_name]
    form_excluded_columns = [User.password_hash]


class ParentAdmin(ModelView, model=Parent):
    column_list = [Parent.id, Parent.label, Parent.user_id, Parent.is_shared, Parent.created_at]
    column_searchable_list = [Parent.label]


class ChildAdmin(ModelView, model=Child):
    column_list = [Child.id, Child.name, Child.meaning, Child.parent_id, Child.sort_order]
    column_searchable_list = [Child.name]


class CommentAdmin(ModelView, model=Comment):
    column_list = [Comment.id, Comment.text, Comment.user_id, Comment.parent_id, Comment.created_at]
    column_searchable_list = [Comment.text]


class ReactionAdmin(ModelView, model=Reaction):
    column_list = [Reaction.id, Reaction.emoji, Reaction.user_id, Reaction.parent_id, Reaction.created_at]


class CollaboratorAdmin(ModelView, model=Collaborator):
    column_list = [Collaborator.id, Collaborator.user_id, Collaborator.parent_id, Collaborator.created_at]


class ParentViewAdmin(ModelView, model=ParentView):
    column_list = [ParentView.id, ParentView.user_id, ParentView.parent_id, ParentView.viewed_at]
    can_create = False
    can_edit = False
    can_delete = False


def setup_admin(app, engine):
    authentication_backend = AdminAuth(secret_key=settings.admin_secret)
    admin = Admin(app, engine, authentication_backend=authentication_backend)
    admin.add_view(UserAdmin)
    admin.add_view(ParentAdmin)
    admin.add_view(ChildAdmin)
    admin.add_view(CommentAdmin)
    admin.add_view(ReactionAdmin)
    admin.add_view(CollaboratorAdmin)
    admin.add_view(ParentViewAdmin)
